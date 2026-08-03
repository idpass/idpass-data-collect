---
id: review-workflow
title: Review Workflow
sidebar_position: 4
draft: true
---

{/*
  Review workflow is hidden from the v2.0.0 documentation.
  The backend/core code remains in place but the admin UI wiring
  was removed before release. Re-enable when the feature is completed
  post-2.0.0 (see commits 0e98a81, dabb139, 7492259).
*/}


# Review Workflow

The review workflow enables administrators to review, approve, or reject form submissions before they take effect on entity state.

## Overview

When review is enabled for a configuration, submissions from field workers enter a **pending** state instead of being applied immediately. An administrator must then approve or reject each submission.

### Submission States

| State | Description |
|-------|-------------|
| **Pending** | Submission received, awaiting review |
| **Approved** | Reviewed and accepted — events applied to entities |
| **Rejected** | Reviewed and declined — no changes applied |

## Admin Workflow

### Reviewing Submissions

1. Navigate to the review queue in the admin interface
2. Select a pending submission to view its details
3. Review the form data and any attachments
4. Choose **Approve** or **Reject**

### Approved Submissions

When a submission is approved:
- The corresponding events are applied to the entity store
- The entity state is updated
- The submission is marked as approved with a timestamp and reviewer ID

### Rejected Submissions

When a submission is rejected:
- No events are applied
- The submission is marked as rejected with a timestamp and reviewer ID
- The original submitter can see the rejection status

## Configuration

Review is configured per tenant via the app configuration. Review settings are stored in the `review_configs` database table and control which form types require review.

## Database Tables

The review workflow uses these tables:
- `submission_reviews` — stores review decisions (approved/rejected) with timestamps
- `review_configs` — stores per-tenant review configuration
