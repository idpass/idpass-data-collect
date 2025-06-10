## Prerequisites
1. NodeJS: v20
2. Android SDK
3. ID PASS Data Collect - https://github.com/idpass/idpass-data-collect
   1. Checkout the branch - `main`


## Local setup
1. Clone this repository
2. Go to the mobile directory
   ```
   cd mobile
   ```
3. Install libraries
   ```
   npm install
   ```
4. ID PASS Data Collect is not available in any registry. Install it locally. 
   ```
   npm install ../../idpass-data-collect
   ```
5. Create `.env.local`
   ```sh
   VITE_BACKEND_API_URL=
   VITE_DB_ENCRYPTION_PASSWORD=
   VITE_FEATURE_DATACOLLECT=true
   VITE_DEBUG=true
   VITE_SYNC_URL=http://localhost:3000 //datacollect url
   ```
6. Launch a development version of the app (web-based)
   ```
   npm run dev
   ```
## Android Build
### Debug APK
   Run
   ```sh
   npm run build:android
   ```
### Release APK
1. Go to the android directory and create `keys` folder
2. Add the selfreg-keystore.jks file
3. Create `keys.properties` file, and add the following variables
   ```
   KEY_PATH=../keys/selfreg-keystore.jks
   KEY_PASSWORD=
   KEY_ALIAS=
   KEY_STORE_PASSWORD=
   ```
4. Run
   ```
   npm run build:android
   cd android
   ./gradlew :app:assembleRelease
   ```


## Accessing the form
1. Go the self reg backend site and login to the admin dashboard
2. Go to the sites and get the `id`.
3. Use this endpoint to get the form JSON - `{backend_url}/api/registration/site/config?site_id={id}`

## Adding the form
1. Login to the self-reg mobile using an ID PASS Data Collect account. 
2. For web, go to **Entities** and click the **Create group** button. Input the the form url.
3. For mobile, create a QR code with the form URL as the value. Go to **Entities** and click the **Create group** button and scan the QR code.

