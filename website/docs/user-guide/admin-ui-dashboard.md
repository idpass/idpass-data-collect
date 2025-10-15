---
id: admin-ui-dashboard
title: Admin UI Dashboard Guide
sidebar_position: 2
---

# Admin UI Dashboard Guide

This guide provides a comprehensive overview of the ID PASS DataCollect Admin UI Dashboard. The dashboard is a web-based interface for managing application configurations, users, and monitoring data.

## 1. Logging In

To access the admin dashboard, you must first log in with your credentials.

1.  Navigate to the admin URL provided by your system administrator.
2.  Enter your **Username** (email) and **Password**.
3.  Click the **Login** button.

Upon successful login, you will be redirected to the main dashboard.

<!-- ![Login Screen]() -->

## 2. The Dashboard (App Manager)

The main page after logging in is the App Manager, which displays all available application configurations, often referred to as "Apps".

<!-- ![App Manager]() -->

### Features

-   **App List**: A grid of cards, where each card represents an application configuration.
-   **Upload Config**: You can create a new app configuration by uploading a valid JSON file using the "Upload JSON Config File" button.

### App Card

Each app is displayed on a card with the following details and actions:

-   **Name**: The display name of the configuration.
-   **ID**: The unique identifier for the configuration.
-   **Version**: The version number of the configuration.
-   **Entities**: The total number of data records (entities) collected for this configuration.
-   **QR Code**: A QR code that can be scanned by the mobile app to load the configuration.
-   **Menu (⋮)**: A menu with several actions:
    -   **Download Config**: Downloads the complete configuration as a JSON file.
    -   **Sync**: Initiates an external synchronization process if configured.
    -   **Edit**: Opens the configuration editor for this app.
    -   **Copy**: Creates a new configuration by copying the existing one.
    -   **Delete**: Permanently deletes the app configuration and its associated data.

## 3. Creating and Editing Configurations

You can create a new configuration from scratch by clicking the **Create Config** button in the navigation bar, or edit an existing one via the App Card menu.

<!-- ![Config Editor]() -->

The configuration form is divided into several sections:

### Basic Information

-   **Name**: A unique name for your configuration.
-   **Description**: A brief description of the configuration's purpose.
-   **Version**: A version number to track changes.

### Entity Forms

This section allows you to define the data collection forms for your application.

-   Click **Add Entity Form** to create a new form.
-   **Name & Title**: Set a unique name (for internal use) and a display title for the form.
-   **Depends On**: Create hierarchical relationships by making a form dependent on another (e.g., a "member" form that depends on a "household" form). The system prevents circular dependencies.
-   **Build/Edit Form**: Click this button to open the **Form Builder**.

#### Form Builder

The Form Builder is a powerful visual tool based on Form.io for creating your data collection forms. You can drag and drop various components (text fields, number inputs, dropdowns, etc.), set validation rules, and define the form's layout. When you save the form in the builder, its JSON schema is saved into your main application configuration.

<!-- ![Form Builder]() -->

### External Sync

Configure how the system synchronizes data with external, third-party systems.

-   **Type**: Select the type of external system (e.g., OpenSPP, OpenFn).
-   **URL**: The endpoint URL of the external system.
-   **Extra Fields**: Add any additional key-value parameters required by the sync adapter (e.g., API keys, batch sizes).

### Auth Configs

Define one or more authentication methods for your application.

-   Click **Add Auth Config** to add a new provider.
-   **Type**: Select the authentication provider (e.g., Auth0, Keycloak).
-   **Fields**: Add the necessary key-value configuration fields required by the selected provider (e.g., `clientId`, `domain`, `realm`).

## 4. User Management

The "Users" page allows administrators to manage user accounts.

<!-- ![User Management]() -->

### Features

-   **User List**: View all registered users with their email and role.
-   **Create User**: Add a new user by providing an email, password, and role.
-   **Edit User**: Modify an existing user's details, including their role.
-   **Delete User**: Permanently remove a user from the system.

## 5. Navigation and Logout

The main navigation bar at the top of the page provides links to:

-   **Home**: The App Manager dashboard.
-   **Users**: The User Management page.
-   **Create Config**: The configuration editor.

To log out, click the user account icon on the far right of the navigation bar and select **Logout**.
