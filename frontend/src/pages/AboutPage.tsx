import type { ReactNode } from 'react';
import { Code2, Container, ShieldCheck, Terminal } from 'lucide-react';

export default function AboutPage() {
  return <section className="about-page"><div className="container about-content">
    <header className="about-hero"><span className="eyebrow">ABOUT CFORGE</span><h1>Write. Compile. Learn. Build.</h1><p>CForge is a public, free online C learning and compilation workspace with no login or signup requirement. Normal compilation and execution now happen locally in the browser through a WebAssembly Clang toolchain.</p></header>
    <div className="about-grid">
      <Info icon={<Code2 size={18}/>} title="CForge" text="CForge combines a Monaco-based C editor, a library of working examples, beginner documentation, and a backend compiler service." />
      <Info icon={<Terminal size={18}/>} title="Compiler" text="The browser uses a real Clang/LLVM toolchain compiled to WebAssembly by YoWASP and targets WebAssembly/WASI. CForge invokes Clang locally and targets C11; this is not identical to native Linux GCC." />
      <Info icon={<ShieldCheck size={18}/>} title="Sandbox" text="Program execution runs inside a WebAssembly Worker with a virtual filesystem and no browser access to the host filesystem, network sockets, or application secrets. Browser/WASM isolation is different from native Docker isolation and does not provide identical OS-level controls." />
      <Info icon={<Container size={18}/>} title="Technologies" text="Frontend: React, TypeScript, Vite, Monaco Editor, WebAssembly Clang, and a browser WASI shim. The legacy Node.js/Express Docker compiler remains separate from the normal browser compilation path." />
    </div>
    <section className="about-limitations"><h2>Limitations</h2><ul><li>The browser compiler must finish loading before the first local compile/run. Its toolchain download is substantially larger than the normal page bundle.</li><li>Browser execution has a 10-second worker timeout, a 1 MB output limit, and a 256 MB maximum WebAssembly linear-memory target where supported by the generated module.</li><li>Sandboxing reduces risk but is not a guarantee against every possible container or host vulnerability.</li><li>WASI provides a restricted, virtualized environment. Native OS-specific APIs, arbitrary networking, host filesystem access, and some threading/POSIX behavior are not available.</li><li>CForge is intended for learning and experimentation, not as a replacement for a full local development environment.</li></ul></section>
  </div></section>;
}
function Info({icon,title,text}:{icon:ReactNode;title:string;text:string}) { return <article className="about-card"><div className="about-icon">{icon}</div><h2>{title}</h2><p>{text}</p></article>; }
