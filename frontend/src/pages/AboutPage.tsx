import type { ReactNode } from 'react';
import { Code2, Container, ShieldCheck, Terminal } from 'lucide-react';

export default function AboutPage() {
  return <section className="about-page"><div className="container about-content">
    <header className="about-hero"><span className="eyebrow">ABOUT CFORGE</span><h1>Write. Compile. Learn. Build.</h1><p>CForge is a public, free online C learning and compilation workspace with no login or signup requirement.</p></header>
    <div className="about-grid">
      <Info icon={<Code2 size={18}/>} title="CForge" text="CForge combines a Monaco-based C editor, a library of working examples, beginner documentation, and a backend compiler service." />
      <Info icon={<Terminal size={18}/>} title="Compiler" text="The backend uses a real GCC toolchain rather than simulated compiler output. CForge targets the C11 language standard in its current compiler setup." />
      <Info icon={<ShieldCheck size={18}/>} title="Sandbox" text="User code is designed to execute inside restricted Docker containers with resource, process, filesystem, and network controls. A production deployment should keep Docker isolated from the public-facing host and verify its security configuration." />
      <Info icon={<Container size={18}/>} title="Technologies" text="Frontend: React, TypeScript, Vite, Monaco Editor. Backend: Node.js, TypeScript, Express. Sandboxed execution: Docker and GCC." />
    </div>
    <section className="about-limitations"><h2>Limitations</h2><ul><li>Compiler and execution availability depends on the backend service being online.</li><li>Resource and execution limits can stop programs that exceed configured time, memory, process, or output budgets.</li><li>Sandboxing reduces risk but is not a guarantee against every possible container or host vulnerability.</li><li>CForge is intended for learning and experimentation, not as a replacement for a full local development environment.</li></ul></section>
  </div></section>;
}
function Info({icon,title,text}:{icon:ReactNode;title:string;text:string}) { return <article className="about-card"><div className="about-icon">{icon}</div><h2>{title}</h2><p>{text}</p></article>; }
