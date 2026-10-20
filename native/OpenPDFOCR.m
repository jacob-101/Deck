#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>
#import <Vision/Vision.h>

static void Fail(NSString *message) {
  NSData *data = [[message stringByAppendingString:@"\n"] dataUsingEncoding:NSUTF8StringEncoding];
  [NSFileHandle.fileHandleWithStandardError writeData:data];
  exit(1);
}
static NSString *Argument(NSArray<NSString *> *args, NSString *name) {
  NSUInteger index = [args indexOfObject:name];
  return index != NSNotFound && index + 1 < args.count ? args[index + 1] : nil;
}

static BOOL ContainsDigit(NSString *string) {
  return [string rangeOfCharacterFromSet:NSCharacterSet.decimalDigitCharacterSet].location != NSNotFound;
}

// Build structured text for one page from its Vision observations. Lines are
// grouped into rows (by vertical proximity) and rows with two or more cells
// are emitted as Markdown tables so column alignment survives extraction.
// Low-confidence text — especially text containing digits — is flagged so the
// caller can review it against the original page.
static NSDictionary *BuildPageResult(VNRecognizeTextRequest *request) {
  NSArray<VNRecognizedTextObservation *> *sorted =
      [request.results sortedArrayUsingComparator:^NSComparisonResult(VNRecognizedTextObservation *a, VNRecognizedTextObservation *b) {
        CGFloat delta = CGRectGetMidY(a.boundingBox) - CGRectGetMidY(b.boundingBox);
        if (fabs(delta) > 0.005) return delta > 0 ? NSOrderedAscending : NSOrderedDescending;
        return CGRectGetMinX(a.boundingBox) < CGRectGetMinX(b.boundingBox) ? NSOrderedAscending : NSOrderedDescending;
      }];

  NSMutableArray<NSDictionary *> *lines = [NSMutableArray array];
  NSMutableArray<NSNumber *> *heights = [NSMutableArray array];
  for (VNRecognizedTextObservation *observation in sorted) {
    VNRecognizedText *candidate = [observation topCandidates:1].firstObject;
    if (!candidate || candidate.string.length == 0) continue;
    CGRect box = observation.boundingBox;
    [lines addObject:@{
      @"text": candidate.string,
      @"confidence": @(candidate.confidence),
      @"minX": @(CGRectGetMinX(box)),
      @"midX": @(CGRectGetMidX(box)),
      @"midY": @(CGRectGetMidY(box)),
      @"height": @(CGRectGetHeight(box)),
    }];
    [heights addObject:@(CGRectGetHeight(box))];
  }
  if (lines.count == 0) {
    return @{ @"text": @"", @"confidence": @(0), @"uncertain": @[] };
  }

  NSArray<NSNumber *> *sortedHeights = [heights sortedArrayUsingSelector:@selector(compare:)];
  CGFloat medianHeight = sortedHeights[sortedHeights.count / 2].doubleValue;
  CGFloat rowThreshold = MAX(medianHeight * 0.6, 0.008);

  // Group consecutive (top-to-bottom) lines into visual rows.
  NSMutableArray<NSMutableArray<NSDictionary *> *> *rows = [NSMutableArray array];
  NSMutableArray<NSDictionary *> *currentRow = nil;
  CGFloat lastMidY = CGFLOAT_MAX;
  for (NSDictionary *line in lines) {
    CGFloat midY = [line[@"midY"] doubleValue];
    if (currentRow == nil || (lastMidY - midY) > rowThreshold) {
      currentRow = [NSMutableArray array];
      [rows addObject:currentRow];
    }
    [currentRow addObject:line];
    lastMidY = midY;
  }

  NSMutableArray<NSString *> *output = [NSMutableArray array];
  NSMutableArray<NSDictionary *> *uncertain = [NSMutableArray array];
  double totalConfidence = 0;
  NSInteger lineCount = 0;

  NSUInteger index = 0;
  while (index < rows.count) {
    NSArray<NSDictionary *> *row = rows[index];
    if (row.count >= 2) {
      // Table block: consecutive rows with two or more cells.
      NSUInteger end = index;
      NSInteger columnCount = 0;
      while (end < rows.count && rows[end].count >= 2) {
        columnCount = MAX(columnCount, (NSInteger)rows[end].count);
        end++;
      }
      columnCount = MIN(columnCount, 8);

      NSMutableArray<NSString *> *header = [NSMutableArray array];
      for (NSInteger column = 0; column < columnCount; column++) {
        [header addObject:column < (NSInteger)row.count ? row[column][@"text"] : @""];
      }
      [output addObject:[NSString stringWithFormat:@"| %@ |", [header componentsJoinedByString:@" | "]]];
      NSMutableArray<NSString *> *divider = [NSMutableArray array];
      for (NSInteger column = 0; column < columnCount; column++) [divider addObject:@"---"];
      [output addObject:[NSString stringWithFormat:@"| %@ |", [divider componentsJoinedByString:@" | "]]];

      for (NSUInteger rowIndex = index + 1; rowIndex < end; rowIndex++) {
        NSArray<NSDictionary *> *tableRow = rows[rowIndex];
        NSMutableArray<NSString *> *cells = [NSMutableArray array];
        for (NSInteger column = 0; column < columnCount; column++) {
          [cells addObject:column < (NSInteger)tableRow.count ? tableRow[column][@"text"] : @""];
        }
        [output addObject:[NSString stringWithFormat:@"| %@ |", [cells componentsJoinedByString:@" | "]]];
      }
      index = end;
    } else {
      [output addObject:row[0][@"text"]];
      index++;
    }
  }

  for (NSDictionary *line in lines) {
    double confidence = [line[@"confidence"] doubleValue];
    NSString *text = line[@"text"];
    totalConfidence += confidence;
    lineCount++;
    BOOL lowDigit = confidence < 0.55 && ContainsDigit(text);
    BOOL veryLow = confidence < 0.4;
    if (lowDigit || veryLow) {
      [uncertain addObject:@{ @"text": text, @"confidence": @(confidence) }];
    }
  }

  return @{
    @"text": [output componentsJoinedByString:@"\n"],
    @"confidence": @(lineCount ? totalConfidence / lineCount : 0),
    @"uncertain": uncertain,
  };
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSDate *started = [NSDate date];
    NSArray<NSString *> *args = NSProcessInfo.processInfo.arguments;
    NSData *input = [NSFileHandle.fileHandleWithStandardInput readDataToEndOfFile];
    if (input.length < 5 || input.length > 50 * 1024 * 1024) Fail(@"Invalid PDF size.");
    PDFDocument *document = [[PDFDocument alloc] initWithData:input];
    if (!document || document.isLocked) Fail(@"This PDF could not be opened for OCR.");
    NSMutableArray<NSNumber *> *pages = [NSMutableArray array];
    NSString *rawPages = Argument(args, @"--pages");
    if (rawPages) {
      for (NSString *value in [rawPages componentsSeparatedByString:@","]) [pages addObject:@(value.integerValue)];
    } else {
      for (NSInteger number = 1; number <= document.pageCount; number++) [pages addObject:@(number)];
    }
    if (pages.count < 1 || pages.count > 100) Fail(@"OCR supports 1–100 pages per run.");
    for (NSNumber *value in pages)
      if (value.integerValue < 1 || value.integerValue > document.pageCount) Fail(@"Invalid OCR page number.");
    NSString *language = Argument(args, @"--language");
    NSMutableArray *outputPages = [NSMutableArray array];
    NSMutableArray<NSString *> *markdownPages = [NSMutableArray array];

    for (NSNumber *value in pages) @autoreleasepool {
      NSInteger number = value.integerValue;
      PDFPage *page = [document pageAtIndex:number - 1];
      NSRect bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
      // Render at 300 DPI (was ~144) for small statement text and digits,
      // capped at 8192 px on the long edge to bound bitmap memory.
      CGFloat scale = MIN(300.0 / 72.0, 8192.0 / MAX(bounds.size.width, bounds.size.height));
      NSInteger width = MAX(1, (NSInteger)ceil(bounds.size.width * scale));
      NSInteger height = MAX(1, (NSInteger)ceil(bounds.size.height * scale));
      NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
        initWithBitmapDataPlanes:NULL pixelsWide:width pixelsHigh:height bitsPerSample:8
        samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace
        bytesPerRow:0 bitsPerPixel:0];
      NSGraphicsContext *graphics = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
      if (!graphics) Fail([NSString stringWithFormat:@"Could not render page %ld.", (long)number]);
      [NSGraphicsContext saveGraphicsState];
      NSGraphicsContext.currentContext = graphics;
      CGContextRef context = graphics.CGContext;
      CGContextSetFillColorWithColor(context, NSColor.whiteColor.CGColor);
      CGContextFillRect(context, CGRectMake(0, 0, width, height));
      CGContextScaleCTM(context, scale, scale);
      [page drawWithBox:kPDFDisplayBoxMediaBox toContext:context];
      [NSGraphicsContext restoreGraphicsState];
      CGImageRef image = bitmap.CGImage;
      if (!image) Fail([NSString stringWithFormat:@"Could not render page %ld.", (long)number]);

      VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
      request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
      request.usesLanguageCorrection = YES;
      if (language && ![language isEqualToString:@"auto"]) request.recognitionLanguages = @[language];
      NSError *error = nil;
      VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
      if (![handler performRequests:@[request] error:&error])
        Fail([NSString stringWithFormat:@"OCR failed on page %ld: %@", (long)number, error.localizedDescription]);

      NSDictionary *pageResult = BuildPageResult(request);
      NSMutableDictionary *entry = [pageResult mutableCopy];
      entry[@"page"] = @(number);
      [outputPages addObject:entry];
      [markdownPages addObject:[NSString stringWithFormat:@"<!-- Page %ld -->\n\n## Page %ld\n\n%@", (long)number, (long)number, entry[@"text"]]];
    }
    NSDictionary *result = @{
      @"pages": outputPages,
      @"markdown": [markdownPages componentsJoinedByString:@"\n\n---\n\n"],
      @"processingTimeMs": @((NSInteger)(-[started timeIntervalSinceNow] * 1000)),
      @"engine": @"Apple Vision"
    };
    NSError *jsonError = nil;
    NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:&jsonError];
    if (!json) Fail(@"Could not encode OCR results.");
    [NSFileHandle.fileHandleWithStandardOutput writeData:json];
  }
  return 0;
}
