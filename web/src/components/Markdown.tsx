import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const LINK = "underline decoration-[#c9c9c2] underline-offset-2 hover:text-[#1c1c1a]";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[14.5px] leading-7 text-[#1c1c1a]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="mb-3 last:mb-0" {...props} />,
          strong: (props) => <strong className="font-semibold text-[#1c1c1a]" {...props} />,
          em: (props) => <em className="italic" {...props} />,
          ul: (props) => <ul className="mb-3 ml-5 list-disc space-y-1 last:mb-0" {...props} />,
          ol: (props) => <ol className="mb-3 ml-5 list-decimal space-y-1 last:mb-0" {...props} />,
          li: (props) => <li className="pl-0.5" {...props} />,
          h1: (props) => <h1 className="heading mt-4 mb-2 text-[19px] leading-tight first:mt-0" {...props} />,
          h2: (props) => <h2 className="heading mt-4 mb-2 text-[17px] leading-tight first:mt-0" {...props} />,
          h3: (props) => <h3 className="mt-4 mb-1.5 text-[15px] font-semibold first:mt-0" {...props} />,
          a: (props) => <a className={LINK} target="_blank" rel="noreferrer" {...props} />,
          blockquote: (props) => (
            <blockquote className="mb-3 border-l-2 border-[#e6e6e2] pl-3 text-[#55554f] last:mb-0" {...props} />
          ),
          hr: () => <hr className="my-4 border-[#eeeeea]" />,
          code: ({ className, ...props }) =>
            // A fenced block arrives with a language class; bare inline code has none.
            className ? (
              <code className="mono block text-[12.5px] leading-6" {...props} />
            ) : (
              <code
                className="mono rounded bg-[#f4f4f1] px-1 py-0.5 text-[12.5px] text-[#33332f]"
                {...props}
              />
            ),
          pre: (props) => (
            <pre
              className="mb-3 overflow-x-auto rounded-xl border border-[#eeeeea] bg-[#fafaf8] p-3 last:mb-0"
              {...props}
            />
          ),
          table: (props) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-[13px]" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border-b border-[#e6e6e2] px-2 py-1.5 text-left font-semibold text-[#1c1c1a]"
              {...props}
            />
          ),
          td: (props) => <td className="border-b border-[#f2f2ee] px-2 py-1.5 text-[#55554f]" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
