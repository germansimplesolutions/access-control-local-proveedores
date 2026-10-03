import https from "https";
import fs from "fs";

function downloadImage(url, destinationPath) {
  const file = fs.createWriteStream(destinationPath);

  https
    .get(url, (response) => {
      if (response.statusCode !== 200) {
        console.error(`Failed to fetch image: ${response.statusMessage}`);
        return;
      }

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        console.log("Image downloaded successfully.");
      });
    })
    .on("error", (error) => {
      console.error("Error downloading image:", error);
    });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export {downloadImage, sleep};
