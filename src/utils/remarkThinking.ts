import { visit } from 'unist-util-visit';

// Inline types to avoid dependency issues
interface Node {
    type: string;
    value?: string;
    children?: Node[];
    data?: any;
    [key: string]: any;
}

interface Parent extends Node {
    children: Node[];
}

// Helper to create the details structure
const createDetailsNode = (children: Node[]) => {
    return {
        type: 'container',
        data: {
            hName: 'details',
            hProperties: {
                className: 'mb-4 rounded-lg overflow-hidden border border-titanium-700/50 bg-titanium-950/30 group'
            }
        },
        children: [
            {
                type: 'container',
                data: {
                    hName: 'summary',
                    hProperties: {
                        className: 'cursor-pointer px-3 py-2 text-xs font-medium text-titanium-400 hover:text-emerald-400 hover:bg-titanium-800/50 transition-colors list-none flex items-center gap-2 select-none outline-none focus:text-emerald-400'
                    }
                },
                children: [
                    {
                        type: 'text',
                        value: 'Proceso de Pensamiento (IA)'
                    }
                ]
            },
            {
                type: 'container',
                data: {
                    hName: 'div',
                    hProperties: {
                        className: 'px-3 py-2 text-xs text-titanium-400 italic border-t border-titanium-800/50 bg-titanium-950/50 font-mono leading-relaxed whitespace-pre-wrap animate-in slide-in-from-top-2 duration-200'
                    }
                },
                children: children
            }
        ]
    };
};

export function remarkThinking() {
    return (tree: Node) => {
        // Visit parents to manipulate children
        visit(tree, (node: Node) => {
            if (!node.children || !Array.isArray(node.children)) return;
            const parent = node as Parent;
            const children = parent.children;

            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const value = child.value || '';
                const isHtml = child.type === 'html';
                const isText = child.type === 'text';

                // Look for start tag
                if ((isHtml || isText) && value.includes('<thinking')) {
                    const startMatch = value.match(/<thinking[^>]*>/i);
                    if (!startMatch || startMatch.index === undefined) continue;

                    const startIndex = startMatch.index;
                    const startTagLength = startMatch[0].length;

                    // Check for end tag in the SAME node
                    const endMatch = value.slice(startIndex + startTagLength).match(/<\/thinking>/i);

                    if (endMatch && endMatch.index !== undefined) {
                        // CASE 1: Start and End in same node
                        const innerContentStart = startIndex + startTagLength;
                        const innerContentEnd = startIndex + startTagLength + endMatch.index;

                        const beforeText = value.slice(0, startIndex);
                        const innerText = value.slice(innerContentStart, innerContentEnd);
                        const afterText = value.slice(innerContentEnd + '<\/thinking>'.length); // approximate length

                        const newNodes: Node[] = [];
                        if (beforeText) newNodes.push({ type: isHtml ? 'html' : 'text', value: beforeText });

                        // We put innerText as a text node inside details
                        newNodes.push(createDetailsNode([{ type: 'text', value: innerText }]));

                        if (afterText) newNodes.push({ type: isHtml ? 'html' : 'text', value: afterText });

                        parent.children.splice(i, 1, ...newNodes);
                        i += newNodes.length - 1; // Adjust index
                        continue;
                    }
                    else {
                        // CASE 2: End tag is in a later node (or missing)
                        let j = i + 1;
                        let foundEnd = false;
                        let endNodeIndex = -1;
                        let endMatchInNode: RegExpMatchArray | null = null;

                        // Look ahead for end tag
                        for (; j < children.length; j++) {
                            const sibling = children[j];
                            if ((sibling.type === 'html' || sibling.type === 'text') && sibling.value && sibling.value.includes('</thinking>')) {
                                endMatchInNode = sibling.value.match(/<\/thinking>/i);
                                if (endMatchInNode) {
                                    foundEnd = true;
                                    endNodeIndex = j;
                                    break;
                                }
                            }
                        }

                        if (foundEnd && endNodeIndex !== -1 && endMatchInNode && endMatchInNode.index !== undefined) {
                            // We found the end.
                            // 1. Process Start Node
                            const beforeStart = value.slice(0, startIndex);
                            const afterStart = value.slice(startIndex + startTagLength); // Content inside start node

                            // 2. Process Middle Nodes
                            const middleNodes = children.slice(i + 1, endNodeIndex);

                            // 3. Process End Node
                            const endNode = children[endNodeIndex];
                            const endNodeValue = endNode.value || '';
                            const endIndex = endMatchInNode.index;
                            const beforeEnd = endNodeValue.slice(0, endIndex); // Content inside end node
                            const afterEnd = endNodeValue.slice(endIndex + endMatchInNode[0].length);

                            // Construct Details Children
                            const detailsChildren: Node[] = [];
                            if (afterStart) detailsChildren.push({ type: 'text', value: afterStart });
                            detailsChildren.push(...middleNodes);
                            if (beforeEnd) detailsChildren.push({ type: 'text', value: beforeEnd });

                            // Construct Replacement Nodes
                            const replacementNodes: Node[] = [];
                            if (beforeStart) replacementNodes.push({ type: 'text', value: beforeStart });
                            replacementNodes.push(createDetailsNode(detailsChildren));
                            if (afterEnd) replacementNodes.push({ type: 'text', value: afterEnd });

                            // Replace range [i ... endNodeIndex]
                            const nodesToRemove = endNodeIndex - i + 1;
                            parent.children.splice(i, nodesToRemove, ...replacementNodes);

                            i += replacementNodes.length - 1;
                        }
                        else {
                             // CASE 3: No end tag found (Streaming or Malformed)
                             // We wrap everything from here to the end?
                             // Or just wrap the start node's remainder + subsequent nodes?
                             // Let's assume user wants to see it even if incomplete.

                             // However, modifying the tree structure for "rest of siblings" might break if we are inside a paragraph but the stream continues outside?
                             // Usually Markdown parsing is line-based.
                             // Let's safe-fail: if we can't find the end, we treat the rest of the parent's children as content.

                             const beforeStart = value.slice(0, startIndex);
                             const afterStart = value.slice(startIndex + startTagLength);

                             const restNodes = children.slice(i + 1);

                             const detailsChildren: Node[] = [];
                             if (afterStart) detailsChildren.push({ type: 'text', value: afterStart });
                             detailsChildren.push(...restNodes);

                             const replacementNodes: Node[] = [];
                             if (beforeStart) replacementNodes.push({ type: 'text', value: beforeStart });

                             // Mark details as open if streaming? No, keep closed to reduce clutter.
                             // Actually, if it's streaming, we might want it visible?
                             // But "clutter" was the complaint.
                             replacementNodes.push(createDetailsNode(detailsChildren));

                             // Replace i to end
                             const nodesToRemove = children.length - i;
                             parent.children.splice(i, nodesToRemove, ...replacementNodes);

                             // Stop processing this parent
                             break;
                        }
                    }
                }
            }
        });
    };
}
