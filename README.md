# Cookie Clickers Mobile Setup

This project is a web-based Cookie Clicker game prepared for Android and iOS app packaging with Capacitor and AdMob rewarded ads.

## Current Project State
- Web app files:
  - `index.html`
  - `style.css`
  - `script.js`
- Capacitor scaffold added:
  - `package.json`
  - `capacitor.config.json`
- Rewarded ad flow in `script.js` already supports:
  - native rewarded ad bridge if available
  - fallback ad simulation if native bridge is not connected yet

## AdMob IDs

### Android
- App ID: `ca-app-pub-9138341481603997~2199897351`
- Rewarded Ad Unit ID: `ca-app-pub-9138341481603997/1649233015`

### iOS
- App ID: `ca-app-pub-9138341481603997~9411113474`
- Rewarded Ad Unit ID: `ca-app-pub-9138341481603997/3187665067`

## Install Dependencies
Run these in the project folder:

```bash
npm install
npx cap add android
npx cap add ios
```

If Android or iOS was already added before, use:

```bash
npx cap sync
```

## Capacitor Build Flow
Basic flow after editing web files:

```bash
npx cap copy
npx cap sync
npx cap open android
npx cap open ios
```

## AdMob Plugin Direction
This project currently expects one of these native bridges to exist:
- `window.AndroidRewardedAd.showRewardedAd(...)`
- `window.Capacitor.Plugins.AdMobBridge.showRewardedAd(...)`
- `window.Capacitor.Plugins.AdMob.showRewardedAd(...)`

The cleanest path is to use a Capacitor AdMob plugin and expose a rewarded ad call matching the payload used in `script.js`.

## Payload Sent From JavaScript
When a rewarded ad is requested, `script.js` sends data shaped like this:

```json
{
  "type": "boost",
  "adUnitId": "platform specific rewarded ad unit id",
  "appId": "platform specific app id",
  "platform": "android or ios"
}
```

## Android Setup

### 1. Add Android project
```bash
npx cap add android
```

### 2. Open Android Studio
```bash
npx cap open android
```

### 3. Add AdMob App ID
In `AndroidManifest.xml`, add the AdMob application metadata inside `<application>`:

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-9138341481603997~2199897351" />
```

### 4. Install and connect AdMob plugin
Use a Capacitor-compatible AdMob plugin such as `@capacitor-community/admob`.

### 5. Rewarded ad behavior
Native side should:
- load rewarded ad using Android rewarded unit ID
- show ad when JS requests it
- return success only if reward is actually earned

### 6. Expected return shape
Preferred result:

```json
{ "rewarded": true }
```

If the plugin returns another format, adapt native bridge code so JS receives a truthy rewarded result.

## iOS Setup

### 1. Add iOS project
```bash
npx cap add ios
```

### 2. Open Xcode
```bash
npx cap open ios
```

### 3. Add AdMob App ID
In `Info.plist`, add:

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-9138341481603997~9411113474</string>
```

### 4. SKAdNetwork / tracking related settings
Depending on AdMob guidance and plugin used, add any required keys to `Info.plist`.
Review the latest AdMob iOS requirements before release.

### 5. Rewarded ad behavior
Native side should:
- load rewarded ad using iOS rewarded unit ID
- show ad when JS requests it
- only resolve success after the user earns reward

## Current JS Rewarded Ad Entry Points
These game flows already use the unified rewarded ad request:
- bonus panel rewarded ads
- offline reward double
- daily reward triple
- upgrade re-level ads

## Important Notes
- In browser development, the project will continue to use the existing simulated ad overlay.
- In native app builds, once AdMob bridge is connected, real rewarded ads can replace simulation automatically.
- Start with test ads before switching to production behavior.
- Review both AdMob policy and store policy before release.

## Suggested Next Step
The next practical step is:
1. run `npm install`
2. add Android and iOS Capacitor projects
3. connect AdMob plugin
4. verify one rewarded flow works end-to-end
