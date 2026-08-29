import { inspect, edit, extract, createSample, imagesToPDF } from "./pdf";
self.onmessage = ({ data }) => {
  const { id, action, bytes, command, pages, images } = data;
  try {
    let result;
    if (action === "inspect") result = { bytes, info: inspect(bytes) };
    else if (action === "edit") {
      const output = edit(bytes, command);
      result = { bytes: output, info: inspect(output) };
    } else if (action === "extract") result = extract(bytes, pages);
    else if (action === "images") {
      const output = imagesToPDF(images);
      result = { bytes: output, info: inspect(output) };
    } else if (action === "sample") {
      const output = createSample();
      result = { bytes: output, info: inspect(output) };
    } else throw new Error("Unknown PDF operation");
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof Error
          ? error.message
          : "The PDF could not be processed.",
    });
  }
};
self.postMessage({ ready: true });
