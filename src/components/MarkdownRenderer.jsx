import { Code } from '@nextui-org/react';
import ReactMarkdown from 'react-markdown';
import React from 'react';

// Strip markdown/md code fences that LLMs commonly wrap responses in.
// Handles single or multiple fenced blocks, extracting inner content and
// joining them while preserving non-fenced text between blocks.
function stripMarkdownFences(text) {
    if (typeof text !== 'string') return text;
    // Remove trailing streaming cursor
    let s = text.replace(/_$/, '');
    // Replace each ```markdown / ```md / ``` fence with its inner content
    return s.replace(/```(?:markdown|md)?\s*\n([\s\S]*?)```/g, '$1').trim();
}

export default function MarkdownRenderer({ children, fontSize }) {
    const content = stripMarkdownFences(children);

    return (
        <ReactMarkdown
            className='markdown-body select-text'
            components={{
                code: ({ node, ...props }) => {
                    const { children: codeChildren } = props;
                    return <Code size='sm'>{codeChildren}</Code>;
                },
                h1: ({ node, ...props }) => (
                    <h1
                        className='text-[1.4em] font-bold mt-3 mb-1'
                        style={fontSize ? { fontSize: `${fontSize + 6}px` } : undefined}
                        {...props}
                    />
                ),
                h2: ({ node, ...props }) => (
                    <h2
                        className='text-[1.2em] font-bold mt-2 mb-1'
                        style={fontSize ? { fontSize: `${fontSize + 4}px` } : undefined}
                        {...props}
                    />
                ),
                h3: ({ node, ...props }) => (
                    <h3
                        className='text-[1.1em] font-semibold mt-2 mb-1'
                        style={fontSize ? { fontSize: `${fontSize + 2}px` } : undefined}
                        {...props}
                    />
                ),
                p: ({ node, ...props }) => (
                    <p
                        className='my-1 leading-relaxed'
                        style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
                        {...props}
                    />
                ),
                ul: ({ node, ...props }) => (
                    <ul
                        className='list-disc list-inside my-1 ml-2'
                        {...props}
                    />
                ),
                ol: ({ node, ...props }) => (
                    <ol
                        className='list-decimal list-inside my-1 ml-2'
                        {...props}
                    />
                ),
                li: ({ node, ...props }) => {
                    const { children: liChildren } = props;
                    return (
                        <li
                            className='my-0.5'
                            children={liChildren}
                        />
                    );
                },
                blockquote: ({ node, ...props }) => (
                    <blockquote
                        className='border-l-3 border-default-300 pl-3 my-2 text-default-600'
                        {...props}
                    />
                ),
                a: ({ node, ...props }) => (
                    <a
                        className='text-primary underline'
                        target='_blank'
                        rel='noopener noreferrer'
                        {...props}
                    />
                ),
                strong: ({ node, ...props }) => (
                    <strong
                        className='font-bold'
                        {...props}
                    />
                ),
                em: ({ node, ...props }) => (
                    <em
                        className='italic'
                        {...props}
                    />
                ),
                hr: () => <hr className='my-2 border-default-200' />,
                table: ({ node, ...props }) => (
                    <div className='overflow-x-auto my-2'>
                        <table
                            className='border-collapse w-full text-sm'
                            {...props}
                        />
                    </div>
                ),
                th: ({ node, ...props }) => (
                    <th
                        className='border border-default-300 px-2 py-1 bg-default-100 font-semibold text-left'
                        {...props}
                    />
                ),
                td: ({ node, ...props }) => (
                    <td
                        className='border border-default-300 px-2 py-1'
                        {...props}
                    />
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    );
}
