---
id: index
title: Welcome to ID PASS DataCollect
sidebar_position: 1
slug: /
hide_table_of_contents: true
---

import HomepageHero from '@site/src/components/HomepageHero';

<HomepageHero />

ID PASS DataCollect is a comprehensive open-source solution that enables organizations to:

- 📱 **Collect data offline** in areas with limited or no internet connectivity
- 🔄 **Synchronize seamlessly** when connections become available
- 🔒 **Ensure data security** with end-to-end encryption and audit trails
- 📊 **Manage beneficiary data** for social protection and humanitarian programs
- 🌍 **Scale globally** with multi-tenant and multi-language support

<div className="cards-grid cards-grid--2col">
  <div className="card">
    <div className="card__header">
      <h3>
        <span className="card__icon">🚀</span>
        Getting Started
      </h3>
    </div>
    <div className="card__body">
      <p>New to ID PASS DataCollect? Start here with installation and your first app. Follow our step-by-step guide to get up and running in minutes.</p>
    </div>
    <div className="card__footer">
      <a href="./getting-started" className="button button--primary">Get Started</a>
    </div>
  </div>
  
  <div className="card">
    <div className="card__header">
      <h3>
        <span className="card__icon">📚</span>
        Package Documentation
      </h3>
    </div>
    <div className="card__body">
      <p>Complete documentation for all three packages: DataCollect client library, Backend API server, and Admin interface.</p>
    </div>
    <div className="card__footer">
      <a href="./packages" className="button button--primary">View Packages</a>
    </div>
  </div>
  
  <div className="card">
    <div className="card__header">
      <h3>
        <span className="card__icon">🏗️</span>
        Architecture
      </h3>
    </div>
    <div className="card__body">
      <p>Learn about event sourcing, CQRS patterns, synchronization architecture, and technical design decisions.</p>
    </div>
    <div className="card__footer">
      <a href="./architecture" className="button button--primary">Architecture Guide</a>
    </div>
  </div>
  
  <div className="card">
    <div className="card__header">
      <h3>
        <span className="card__icon">⚙️</span>
        Deployment
      </h3>
    </div>
    <div className="card__body">
      <p>Production deployment guides, Docker setup, environment configuration, and monitoring strategies.</p>
    </div>
    <div className="card__footer">
      <a href="./deployment" className="button button--primary">Deployment Guide</a>
    </div>
  </div>
</div>

## Key Features

### [Offline-First Architecture](../glossary#offline-first-architecture)
- Complete functionality without internet connection
- Automatic sync when connectivity is restored
- No data loss in disconnected environments

### Event Sourcing & CQRS
- Complete audit trail of all changes
- Cryptographic integrity verification
- Time-travel debugging capabilities

### Multi-Level Synchronization
- Client ↔ Server synchronization
- Server ↔ External systems (OpenSPP, etc.)
- Conflict resolution strategies

### Enterprise-Ready
- Multi-tenant architecture
- Role-based access control
- Comprehensive security features
- Production-tested at scale

## Who Uses ID PASS DataCollect?

- **Government Agencies** - National social protection programs
- **UN Organizations** - Humanitarian response and refugee assistance
- **NGOs** - Community development and beneficiary management
- **Health Organizations** - Patient registration and health DataCollection

## Documentation Overview

### For Developers
- [Getting Started Guide](./getting-started) - Installation and setup
- [DataCollect Package](./packages/datacollect) - Client library documentation
- [Backend API](./packages/backend) - Server API reference
- [Admin Interface](./packages/admin) - Management interface
- [Architecture Guide](./architecture) - Technical deep dive

### For Users & Administrators
- [Package Overview](./packages) - All three packages explained
- [Deployment Guide](./deployment) - Production deployment
- [Configuration](./getting-started/configuration) - System configuration

### For Organizations
- [Implementation Examples](./examples/basic-usage) - How others use ID PASS DataCollect

## Support & Community

- 💬 [GitHub Discussions](https://github.com/idpass/idpass-data-collect/discussions) - Ask questions and share ideas
- 🐛 [Issue Tracker](https://github.com/idpass/idpass-data-collect/issues) - Report bugs and request features
- 📧 [Contact Support](mailto:support@idpass.org) - Professional support options

## License

ID PASS DataCollect is open source software licensed under the [Apache License 2.0](https://github.com/idpass/idpass-data-collect/blob/main/LICENSE).

---

*This documentation is continuously updated. For the latest version, visit our [GitHub repository](https://github.com/idpass/idpass-data-collect/).*