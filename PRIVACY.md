# Privacy Policy for Bilibili Timestamp Bookmarks

**Effective date: August 22, 2026**

Bilibili Timestamp Bookmarks is a Chrome extension that lets users save, organize, loop, and revisit timestamps from Bilibili videos.

## Information handled by the extension

When a user saves a bookmark, the extension may store:

- The Bilibili video URL and video identifier
- The video title
- Saved timestamps
- Optional notes entered by the user
- Dates used internally to organize saved records

The extension reads the current video's playback position so it can save a timestamp and perform user-requested looping. It does not monitor or record general browsing activity, clicks, scrolling, or keystrokes.

## How information is used

This information is used only to provide the extension's bookmarking, saved-video, search, navigation, and looping features.

## Storage and transmission

Saved records are stored using Chrome's extension storage APIs. Depending on the user's Chrome settings, Chrome may synchronize this information between browsers signed into the same Google account. The developer does not operate a server that receives or stores saved bookmark records.

For supported Bilibili episode pages, the extension may send an episode identifier to Bilibili's HTTPS API to resolve the corresponding video identifier. Saved notes and bookmark records are not included in that request.

## Sharing and sale of information

The developer does not sell, rent, or transfer user data to third parties. Information is not used for advertising, profiling, creditworthiness, lending, or purposes unrelated to the extension's single purpose.

## Data retention and deletion

Saved records remain in Chrome extension storage until the user deletes individual bookmarks or saved videos, clears the extension's storage, or uninstalls the extension. Chrome synchronization behavior is controlled by the user's browser and Google account settings.

## Security

External Bilibili API requests use HTTPS. No remotely hosted JavaScript or WebAssembly is loaded or executed by the extension.

## Changes to this policy

This policy may be updated when the extension's functionality or data practices change. The effective date above will be updated when a revised policy is published.

## Contact

Questions about this policy may be submitted through the Issues section of this GitHub repository.

