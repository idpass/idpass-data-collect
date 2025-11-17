# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-01-XX

### Added

- OpenSPP adapter enhancements with field mapping, batch processing, and retry logic
- OpenSPP field metadata API endpoints for admin UI integration
- Enhanced duplicate detection and resolution capabilities
- Comprehensive Auth0 and Keycloak authentication documentation

### Improved

- OpenSPP sync adapter now supports configurable batch sizes and delays
- Retry logic with exponential backoff for failed sync operations
- Field mapping UI with transformer support (text, date, ID, multi-select, boolean)
- Better error handling and logging for external sync operations

## [1.0.0] - 2025-09-24

### Added

- Initial release of the ID PASS DataCollect platform.
- Core `datacollect` library for offline-first data management.
- `backend` server for synchronization and data storage.
- `admin` web interface for system administration.
- `mobile` application for data collection in the field.
- Comprehensive documentation website.
