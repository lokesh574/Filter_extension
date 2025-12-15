// Background script for Filter.io Chrome Extension
chrome.action.onClicked.addListener((tab) => {
    // Open Filter.io in a new tab when extension icon is clicked
    chrome.tabs.create({
        url: chrome.runtime.getURL('index.html')
    });
});