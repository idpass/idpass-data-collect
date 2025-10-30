import React, {type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import Mermaid from '@theme-original/Mermaid';
import type MermaidType from '@theme/Mermaid';
import type {WrapperProps} from '@docusaurus/types';

type Props = WrapperProps<typeof MermaidType>;

export default function MermaidWrapper(props: Props): ReactNode {
  // During SSG, useColorMode hook fails because ColorModeProvider isn't available
  // Use BrowserOnly to render Mermaid only on the client side
  // This prevents the SSG error while still rendering diagrams properly
  return (
    <BrowserOnly fallback={<div className="mermaid-placeholder" style={{minHeight: '200px'}} />}>
      {() => <Mermaid {...props} />}
    </BrowserOnly>
  );
}
