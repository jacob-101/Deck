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
      CGFloat scale = MIN(2.0, 4096.0 / MAX(bounds.size.width, bounds.size.height));
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
      NSArray<VNRecognizedTextObservation *> *observations = [request.results sortedArrayUsingComparator:^NSComparisonResult(VNRecognizedTextObservation *a, VNRecognizedTextObservation *b) {
        CGFloat delta = CGRectGetMidY(a.boundingBox) - CGRectGetMidY(b.boundingBox);
        if (fabs(delta) > 0.01) return delta > 0 ? NSOrderedAscending : NSOrderedDescending;
        return CGRectGetMinX(a.boundingBox) < CGRectGetMinX(b.boundingBox) ? NSOrderedAscending : NSOrderedDescending;
      }];
      NSMutableArray<NSString *> *lines = [NSMutableArray array];
      double confidence = 0;
      for (VNRecognizedTextObservation *observation in observations) {
        VNRecognizedText *candidate = [observation topCandidates:1].firstObject;
        if (candidate) { [lines addObject:candidate.string]; confidence += candidate.confidence; }
      }
      NSString *text = [lines componentsJoinedByString:@"\n"];
      double average = lines.count ? confidence / lines.count : 0;
      [outputPages addObject:@{ @"page": @(number), @"text": text, @"confidence": @(average) }];
      [markdownPages addObject:[NSString stringWithFormat:@"<!-- Page %ld -->\n\n## Page %ld\n\n%@", (long)number, (long)number, text]];
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
