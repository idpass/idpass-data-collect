---
id: mobile-app
title: Mobile App User Guide
sidebar_position: 3
---

# Mobile App User Guide

Welcome to the user guide for the ID PASS DataCollect Mobile App. This application is designed for reliable, offline-first data collection in the field.

## 1. Overview

The mobile app allows you to:

-   Load specific data collection applications (configs) dynamically.
-   Collect data using forms, even without an internet connection.
-   Store data securely on your device.
-   Automatically synchronize data with a central server when you're online.

## 2. Getting Started: Loading an App

The main screen of the application is the **App Dashboard**, where you can see all the data collection "apps" (configurations) you have loaded onto your device.

<!-- ![Mobile App Dashboard]() -->

To start collecting data, you first need to load an app configuration. This is typically provided by your project administrator.

### Loading an App via QR Code

This is the easiest way to load a new app:

1.  On the App Dashboard, tap the **Scan QR Code** button.
2.  Your device's camera will open. Point it at the QR code provided by your administrator.
3.  The app will automatically download, validate, and install the configuration.
4.  The new app will appear in your list on the dashboard.

### Loading an App via URL

If you have a URL for the configuration file instead of a QR code:

1.  On the App Dashboard, tap the **Add App from URL** button.
2.  Paste the URL into the input field.
3.  Tap **Load** to download and install the configuration.

## 3. Collecting Data

Once an app is loaded, you can start collecting data.

1.  From the App Dashboard, tap on the app you want to use.
2.  This will take you to the app's main screen, which will show a list of available forms for data collection.
3.  Tap on a form to open it.
4.  Fill out the form fields as required. The app supports various input types, including text, numbers, dates, multiple-choice questions, and more.
5.  Once the form is complete, tap the **Submit** button.

Your data is now saved securely on your device. You can continue collecting data even if you are offline.

<!-- ![Mobile Form]() -->

## 4. Viewing Collected Data

You can view the data you have collected for each app.

1.  From the App Dashboard, tap on the app you want to view.
2.  You will see a list of records (entities) that have been created.
3.  Tap on any record to view its details.

### Entity Detail View

The entity detail view shows:
- **Entity Information**: All form data for the selected record
- **Dependent Forms**: If the entity has related forms (e.g., household members), you can navigate to them
- **Event History**: A complete history of changes made to the entity, including:
  - Event type (create, update, etc.)
  - Timestamp of each change
  - Sync status (Local, Synced, External)
  - Full event data
- **Sync Status Indicators**: Visual indicators show whether data is:
  - **Local**: Stored only on your device
  - **Synced**: Synchronized with the server
  - **External**: Synchronized with external systems (e.g., OpenSPP)

### Dynamic Entity Views

The app supports dynamic entity views that adapt to your configuration:
- **Multi-Form Navigation**: Navigate between related forms (e.g., from household to members)
- **Reverse Data Transformation**: When viewing data synced from external systems, data is automatically transformed back to the form format
- **Offline Indicators**: Network status indicators show when you're offline and data will sync automatically when connection is restored

## 5. Synchronization and Authentication

### Automatic Sync

The mobile app is designed to be offline-first. All data you collect is stored locally on your device. When your device has an internet connection, the app will automatically and securely synchronize your data with the central server in the background. You do not need to manually initiate the sync process.

**Sync Process**:
1. **Local Storage**: All data is stored locally using IndexedDB for offline access
2. **Background Sync**: When online, the app automatically syncs in the background
3. **Conflict Resolution**: The app handles conflicts automatically using version numbers
4. **External Sync**: If configured, data is also synchronized with external systems (e.g., OpenSPP)

**Network Status**:
- The app displays network status indicators
- When offline, you can continue collecting data
- Data will sync automatically when connection is restored
- Sync status is shown for each entity (Local, Synced, External)

### Data Transformation

When syncing with external systems (like OpenSPP), the app automatically handles data format conversion:
- **Date Formats**: Converts dates between form format and external system format
- **ID Values**: Handles ID mappings for relation fields
- **Multi-Select**: Converts between arrays and delimited strings
- **Boolean Values**: Normalizes checkbox values

This transformation happens transparently - you see data in the form format, while the external system receives it in its required format.

### Authentication

Some applications may require you to log in before you can synchronize data. If this is the case:

1.  The app will prompt you to log in.
2.  Enter the credentials (e.g., username and password) provided by your administrator.
3.  Some apps may use external authentication providers (like Auth0 or Keycloak), which will open a separate login page.

Once you are authenticated, the app will be able to sync your data whenever it's online.
