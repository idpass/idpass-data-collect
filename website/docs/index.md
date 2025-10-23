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
        <span className="card__icon">💻</span>
        Developer Guide
      </h3>
    </div>
    <div className="card__body">
      <p>Set up your environment, understand the architecture, and deploy the stack with confidence.</p>
      <ul>
        <li>Installation & configuration walkthroughs</li>
        <li>Architecture explanations and SDK references</li>
        <li>Docker and bare-metal deployment guides</li>
      </ul>
    </div>
    <div className="card__footer">
      <a href="./developers" className="button button--primary">Explore Developer Docs</a>
    </div>
  </div>

  <div className="card">
    <div className="card__header">
      <h3>
        <span className="card__icon">🧑‍🤝‍🧑</span>
        Admin & Mobile Guide
      </h3>
    </div>
    <div className="card__body">
      <p>Learn how programme administrators and field agents use the platform every day.</p>
      <ul>
        <li>Admin dashboard orientation and workflows</li>
        <li>Mobile app steps for offline collection</li>
        <li>Shared glossary for cross-team clarity</li>
      </ul>
    </div>
    <div className="card__footer">
      <a href="./users" className="button button--primary">Explore User Docs</a>
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

### Developer resources
- [Developer Guide](./developers) - Everything you need to build, integrate, and deploy.
- [Package Documentation](./packages) - Deep dives into workspace packages and APIs.
- [Architecture Reference](./architecture) - Event sourcing, synchronization, and security concepts.

### Admin & mobile resources
- [Admin & Mobile Guide](./users) - Orientation for administrators and field agents.
- [Admin UI Dashboard](./user-guide/admin-ui-dashboard) - Manage configurations, users, and sync.
- [Mobile App Guide](./user-guide/mobile-app) - Collect data offline and keep records synchronized.

### Examples & adoption
- [Implementation Examples](./examples/basic-usage) - How others use ID PASS DataCollect in production.

## Support & Community

- 💬 [GitHub Discussions](https://github.com/idpass/idpass-data-collect/discussions) - Ask questions and share ideas
- 🐛 [Issue Tracker](https://github.com/idpass/idpass-data-collect/issues) - Report bugs and request features
- 📧 [Contact Support](mailto:support@idpass.org) - Professional support options

## License

ID PASS DataCollect is open source software licensed under the [Apache License 2.0](https://github.com/idpass/idpass-data-collect/blob/main/LICENSE).

---

*This documentation is continuously updated. For the latest version, visit our [GitHub repository](https://github.com/idpass/idpass-data-collect/).*