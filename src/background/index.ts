chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Job Filler installed');
});

// ponytail: minimal background — message routing can live here if popup→content
// direct messaging ever hits CORS issues. Add when needed.
export {};
