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

## 5. Synchronization and Authentication

### Automatic Sync

The mobile app is designed to be offline-first. All data you collect is stored locally on your device. When your device has an internet connection, the app will automatically and securely synchronize your data with the central server in the background. You do not need to manually initiate the sync process.

### Authentication

Some applications may require you to log in before you can synchronize data. If this is the case:

1.  The app will prompt you to log in.
2.  Enter the credentials (e.g., username and password) provided by your administrator.
3.  Some apps may use external authentication providers (like Auth0 or Keycloak), which will open a separate login page.

Once you are authenticated, the app will be able to sync your data whenever it's online.
