# Security Policy

## Overview

The ID PASS Data Collect project takes security seriously. This document outlines our security policy, supported versions, and the process for responsibly reporting security vulnerabilities.

## Supported Versions

We actively maintain and provide security updates for the following versions:

| Version | Supported | Status                                      |
| ------- | --------- | ------------------------------------------- |
| 1.0.x   | ✅ Yes    | Active development                          |
| < 1.0   | ❌ No     | Pre-release, not recommended for production |

**Note**: As this is currently version 1.0.0, we recommend always using the latest stable release for security updates.

## Security Considerations

ID PASS Data Collect handles sensitive household and beneficiary data. Key security features include:

- **🔐 JWT Authentication** - Secure API access with role-based permissions
- **📝 Event Sourcing** - Complete audit trail of all data changes
- **🔒 Offline-First Design** - Data encrypted at rest using IndexedDB encryption
- **🏢 Multi-Tenant Architecture** - Isolated data per application instance
- **⚡ Secure Sync** - Encrypted data transmission between client and server

## Reporting Security Vulnerabilities

We encourage responsible disclosure of security vulnerabilities. **Please do not report security vulnerabilities through public GitHub issues.**

### How to Report

1. **Email**: Send details to `security@newlogic.com`
2. **Subject Line**: `[SECURITY] ID PASS Data Collect - [Brief Description]`
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Suggested fix (if available)
   - Your contact information

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 5 business days
- **Regular Updates**: We will keep you informed of our progress
- **Resolution Timeline**: We aim to resolve critical vulnerabilities within 30 days
- **Credit**: We will credit security researchers (with permission) in our security advisories

## Security Response Process

1. **Report Received**: Security team reviews and triages the report
2. **Verification**: We reproduce and verify the vulnerability
3. **Impact Assessment**: We assess the severity and potential impact
4. **Fix Development**: We develop and test a fix
5. **Coordinated Disclosure**: We coordinate the release with the reporter
6. **Public Disclosure**: We publish a security advisory after the fix is available

## Security Best Practices for Users

### For Developers

- **Environment Variables**: Never commit `.env` files with real credentials
- **API Keys**: Rotate JWT secrets regularly in production
- **Database Security**: Use strong passwords and enable SSL for PostgreSQL connections
- **Network Security**: Run the backend server behind a reverse proxy (nginx/Apache)
- **Updates**: Keep all dependencies up to date

### For Production Deployments

- **TLS/SSL**: Always use HTTPS in production
- **Database Encryption**: Enable PostgreSQL encryption at rest
- **Backup Security**: Encrypt database backups
- **Access Control**: Implement proper firewall rules
- **Monitoring**: Set up security monitoring and alerting
- **Regular Audits**: Perform regular security audits

### Docker Security

When using our Docker configurations:

```bash
# Use environment files with proper permissions
chmod 600 .env postgresql.env

# Don't use default passwords in production
# Update all passwords in environment files

# Use specific image tags, not 'latest'
# Review docker-compose.yaml configurations
```

## Vulnerability Classifications

We use the following severity classifications:

- **Critical**: Remote code execution, data breach, authentication bypass
- **High**: Privilege escalation, sensitive data exposure
- **Medium**: Denial of service, information disclosure
- **Low**: Minor information leaks, non-security-impacting bugs

## Security Resources

- **OWASP Top 10**: We follow OWASP security guidelines
- **Security Headers**: Implement proper HTTP security headers
- **Dependency Scanning**: We use automated tools to scan for vulnerable dependencies
- **Code Analysis**: Static code analysis for security issues

## Contact Information

- **Security Team**: security@newlogic.com
- **General Issues**: https://github.com/idpass/idpass-data-collect/issues
- **Website**: https://newlogic.com

## Security Hall of Fame

We recognize security researchers who help improve our security:

_To be updated as we receive and resolve security reports._

---

**Last Updated**: June 2025
**Next Review**: July 2025

This security policy is subject to change. Please check this document regularly for updates.
