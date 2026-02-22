/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

export default {
  common: {
    logout: 'Logout',
    backToHome: 'Back to home',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Retry',
    loading: 'Loading...',
    submit: 'Submit',
    agent: 'Agent',
    citizen: 'Citizen',
  },
  citizenLogin: {
    title: 'Citizen Portal',
    enterProgramId: 'Enter your program ID to access your records.',
    programIdLabel: 'Program ID',
    programIdPlaceholder: 'e.g., demo-household-registry',
    continue: 'Continue',
    selfServiceDisabled: 'Self-service is not enabled for this program.',
    loginWithEsignet: 'Login with eSignet',
    oidcNotConfigured:
      'OIDC login is not configured for this program. Contact your administrator.',
    chooseDifferentProgram: 'Choose a different program',
    programNotFound: 'Program not found or unavailable.',
    oidcStartFailed: 'Failed to start login. Please try again.',
    chooseAuthMethod: 'Choose how to verify your identity:',
    loginWithId: 'Login with National ID',
    loginWithOtp: 'Login with OTP',
    nationalId: 'National ID',
    dateOfBirth: 'Date of Birth',
    verifyIdentity: 'Verify Identity',
    phoneOrEmail: 'Phone number or email',
    requestCode: 'Request Code',
    otpCode: 'Verification Code',
    verifyCode: 'Verify Code',
    otpSent: 'A verification code has been sent. Enter it below.',
    verificationFailed: 'Verification failed. Please check your information and try again.',
    otpRequestFailed: 'Failed to send verification code. Please try again.',
    or: 'or',
  },
  dashboard: {
    welcome: 'Welcome, {name}',
    manageProfile: 'Manage your profile and submit change requests.',
    myProfile: 'My Profile',
    viewPersonalInfo: 'View your personal information',
    submissions: 'Submissions',
    viewHistory: 'View your change request history',
    submitChangeRequest: 'Submit a change request',
  },
  profile: {
    title: 'My Profile',
    lastUpdated: 'Last updated: {date}',
    fieldColumn: 'Field',
    valueColumn: 'Value',
  },
  changeRequest: {
    updateInfo: 'Update Your Information',
    noEditableFields: 'No editable fields available.',
    submitChangeRequest: 'Submit Change Request',
    submitted:
      'Your change request has been submitted. Redirecting to submissions...',
    failedToLoad: 'Failed to load form',
    submissionFailed: 'Submission failed',
  },
  submissionHistory: {
    title: 'Submission History',
    submitted: 'Submitted {date}',
    noSubmissions:
      'No submissions yet. Submit a change request from your dashboard.',
  },
  oidcCallback: {
    processing: 'Processing authentication...',
    verifying: 'Verifying identity...',
    exchanging: 'Exchanging credentials...',
    success: 'Login successful! Redirecting...',
    noResponse:
      'Authentication failed. No response from identity provider.',
    incomplete: 'Authentication response is incomplete.',
    noRecord:
      'No matching beneficiary record found. Please contact your administrator.',
    verifyFailed:
      'We were unable to verify your identity. Please try again or contact your program administrator.',
    backToLogin: 'Back to Login',
  },
  header: {
    appName: 'ID PASS DataCollect',
  },
  status: {
    pending: 'Under Review',
    approved: 'Approved',
    rejected: 'Rejected',
  },
  agentLogin: {
    title: 'Agent Login',
    email: 'Email',
    password: 'Password',
    login: 'Login',
    invalidCredentials: 'Invalid email or password',
    noPrograms:
      'No programs assigned to this account. Contact your administrator.',
    selectProgram: 'Select Program',
    chooseProgram: 'Choose a program to work with:',
    backToLogin: 'Back to login',
  },
}
