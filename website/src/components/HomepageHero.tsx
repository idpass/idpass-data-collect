import React from 'react';

export default function HomepageHero(): JSX.Element {
  return (
    <header className="hero">
      <div className="container">
        <h1 className="hero__title">
          ID PASS DataCollect
        </h1>
        <p className="hero__subtitle">
          Offline-first data management for social protection programs and humanitarian assistance
        </p>
        <div className="hero__cta">
          <a
            className="button button--primary button--lg"
            href="getting-started">
            Get Started
          </a>
          <a
            className="button button--secondary button--lg"
            href="packages">
            View Packages
          </a>
        </div>
      </div>
    </header>
  );
}