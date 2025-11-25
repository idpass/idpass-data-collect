import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidProps {
  chart: string;
  title?: string;
}

export default function Mermaid({ chart, title }: MermaidProps): React.JSX.Element {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uniqueId] = useState(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    if (!mermaidRef.current || !chart) return;


    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'inherit',
      themeVariables: {
        primaryColor: '#4caf50',
        primaryTextColor: '#fff',
        primaryBorderColor: '#7e57c2',
        lineColor: '#333',
        secondaryTextColor: '#333',
        tertiaryColor: '#f0f0f0',
        background: '#fff',
        mainBkgColor: '#fff',
        secondBkgColor: '#f5f5f5',
        textColor: '#333',
      },
    });

    const renderMermaid = async () => {
      try {
        setError(null);
        if (mermaidRef.current) {
          mermaidRef.current.textContent = chart;
          mermaidRef.current.removeAttribute('data-processed');
          await mermaid.run({
            nodes: [mermaidRef.current],
            suppressErrors: false,
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('Error rendering mermaid diagram:', err);
        setError(errorMessage);
        if (mermaidRef.current) {
          mermaidRef.current.textContent = '';
        }
      }
    };

    renderMermaid();
  }, [chart, uniqueId]);

  if (error) {
    return (
      <div className="mermaid-container" style={{ margin: '1.5rem 0' }}>
        {title && <h4 style={{ marginBottom: '0.5rem' }}>{title}</h4>}
        <div
          style={{
            color: 'var(--ifm-color-danger)',
            padding: '1rem',
            border: '1px solid var(--ifm-color-danger)',
            borderRadius: '4px',
            backgroundColor: 'var(--ifm-color-danger-contrast-background)',
          }}
        >
          Error rendering diagram: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mermaid-container" style={{ margin: '1.5rem 0' }}>
      {title && <h4 style={{ marginBottom: '0.5rem' }}>{title}</h4>}
      <div
        ref={mermaidRef}
        className="mermaid"
        data-mermaid-id={uniqueId}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100px',
        }}
      />
    </div>
  );
}
