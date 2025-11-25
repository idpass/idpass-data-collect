const { visit } = require('unist-util-visit');

export default function remarkMermaid() {
  return (tree: any) => {
    visit(tree, 'code', (node: any, index: number, parent: any) => {
      if (node.lang === 'mermaid' && parent && typeof index === 'number') {
        const mermaidNode = {
          type: 'mdxJsxFlowElement',
          name: 'Mermaid',
          attributes: [
            {
              type: 'mdxJsxAttribute',
              name: 'chart',
              value: node.value,
            },
          ],
          children: [],
        };
        parent.children[index] = mermaidNode;
      }
    });
  };
}
