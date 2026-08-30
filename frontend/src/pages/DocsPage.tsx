import { BookOpen, Code2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type DocSection = { id: string; title: string; text: string; code?: string; tip?: string };

const sections: DocSection[] = [
  { id: 'introduction', title: 'Introduction', text: 'C is a compiled programming language used for systems, embedded software, operating systems, and learning core programming concepts. CForge lets you read examples, edit them, and compile/run them locally in your browser using a real Clang/LLVM toolchain compiled to WebAssembly. No compiler backend is required for normal Run or Compile operations.' },
  { id: 'hello-world', title: 'Hello World', text: 'A C program starts with main. Include stdio.h when you need printf or other standard input/output functions.', code: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, CForge!\\n");\n    return 0;\n}' },
  { id: 'variables', title: 'Variables', text: 'Variables store values. Give each variable a type and a name before using it.', code: 'int age = 18;\ndouble price = 19.99;\nchar grade = \'A\';' },
  { id: 'data-types', title: 'Data Types', text: 'Common C types include int for whole numbers, float and double for decimal values, char for a single character, and void for no value.', code: 'int count = 10;\nfloat score = 9.5f;\ndouble distance = 42.25;\nchar letter = \'C\';' },
  { id: 'operators', title: 'Operators', text: 'Arithmetic operators calculate values. Comparison operators produce true/false-style integer results, and logical operators combine conditions.', code: 'int total = 10 + 5;\nint remainder = 17 % 4;\nint bigger = total > remainder;' },
  { id: 'input-output', title: 'Input/Output', text: 'printf writes output. scanf reads formatted input. Use & with most scalar variables passed to scanf.', code: '#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    scanf("%d %d", &a, &b);\n    printf("%d\\n", a + b);\n    return 0;\n}' },
  { id: 'if-else', title: 'if/else', text: 'Use if to run code when a condition is true. else provides an alternative path.', code: 'if (score >= 50) {\n    printf("Pass");\n} else {\n    printf("Try again");\n}' },
  { id: 'switch', title: 'switch', text: 'switch is useful when one expression is compared with several constant cases. Usually each case ends with break.', code: 'switch (choice) {\n    case 1:\n        printf("One");\n        break;\n    default:\n        printf("Other");\n}' },
  { id: 'for', title: 'for', text: 'A for loop is convenient when you know the loop setup, condition, and update in one place.', code: 'for (int i = 1; i <= 5; i++) {\n    printf("%d\\n", i);\n}' },
  { id: 'while', title: 'while', text: 'while repeats a block while its condition remains true. Make sure something inside the loop can eventually make the condition false.', code: 'int i = 1;\nwhile (i <= 5) {\n    printf("%d\\n", i);\n    i++;\n}' },
  { id: 'do-while', title: 'do-while', text: 'A do-while loop runs its body at least once, then checks the condition.', code: 'int choice;\ndo {\n    scanf("%d", &choice);\n} while (choice != 0);' },
  { id: 'functions', title: 'Functions', text: 'Functions split a program into reusable pieces. Define the return type, name, parameters, and body.', code: 'int square(int value) {\n    return value * value;\n}\n\nint main(void) {\n    return square(5);\n}' },
  { id: 'arrays', title: 'Arrays', text: 'An array stores multiple values of the same type in contiguous elements. Indexing starts at zero.', code: 'int numbers[4] = {10, 20, 30, 40};\nprintf("%d", numbers[2]);' },
  { id: 'strings', title: 'Strings', text: 'C strings are character arrays terminated by a null character. The string.h library provides common string functions.', code: '#include <string.h>\nchar name[20] = "CForge";\nprintf("%zu", strlen(name));' },
  { id: 'pointers', title: 'Pointers', text: 'A pointer stores an address. The & operator gets an address and * dereferences a pointer.', code: 'int value = 10;\nint *ptr = &value;\n*ptr = 20;\nprintf("%d", value);' },
  { id: 'structures', title: 'Structures', text: 'A structure groups related values, potentially with different types, into one object.', code: 'struct Student {\n    char name[30];\n    int marks;\n};\n\nstruct Student s = {"Asha", 90};' },
  { id: 'recursion', title: 'Recursion', text: 'A recursive function calls itself. Every recursive algorithm needs a base case so the calls eventually stop.', code: 'int factorial(int n) {\n    if (n <= 1) return 1;\n    return n * factorial(n - 1);\n}' },
  { id: 'file-handling', title: 'File Handling', text: 'C can work with files using FILE pointers and functions such as fopen, fprintf, fgets, and fclose. In CForge, supported file operations use the WebAssembly/WASI virtual filesystem and do not expose your real computer filesystem.', code: '#include <stdio.h>\n\nint main(void) {\n    FILE *file = fopen("notes.txt", "w");\n    if (!file) return 1;\n    fprintf(file, "Hello\\n");\n    fclose(file);\n    return 0;\n}' },
  { id: 'common-errors', title: 'Common Errors', text: 'Typical beginner errors include missing semicolons, mismatched braces, using the wrong format specifier, reading into an uninitialized pointer, and forgetting a loop update. Read the compiler message and start at the reported line.' },
  { id: 'browser-compiler', title: 'Browser Compiler', text: 'CForge uses Clang/LLVM 22 built for WebAssembly/WASI through the YoWASP toolchain. The editor sends source code to a dedicated Web Worker, where Clang compiles it to a WASI WebAssembly program and the same Worker executes that program with an in-memory filesystem. The target language mode is C11 (-std=c11). This environment is portable but is not identical to native Linux/GCC.', tip: 'Browser limits: no arbitrary network sockets, no host filesystem access, no application secrets, and some native POSIX or threading features are unavailable. The execution Worker is terminated after the configured timeout.' },
];

export default function DocsPage() {
  const navigate = useNavigate();
  const runExample = (code: string) => { localStorage.setItem('cforge-resource-code', code); navigate('/'); };
  return <section className="docs-page"><div className="container docs-layout">
    <aside className="docs-sidebar"><div className="docs-sidebar-title"><BookOpen size={17}/><strong>CForge Docs</strong></div><nav>{sections.map(s => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}</nav></aside>
    <main className="docs-content"><header className="docs-hero"><span className="eyebrow"><BookOpen size={13}/> LEARN C</span><h1>Learn C by building.</h1><p>Short, practical explanations with examples you can open directly in the CForge editor.</p></header>
      {sections.map((s) => <article className="doc-section" id={s.id} key={s.id}><div className="doc-heading"><span className="doc-index">{String(sections.indexOf(s) + 1).padStart(2, '0')}</span><div><h2>{s.title}</h2><p>{s.text}</p></div></div>{s.code && <div className="doc-example"><div className="doc-example-head"><span><Code2 size={14}/> Example</span><button type="button" onClick={() => runExample(s.code!)}>Run in CForge <ChevronRight size={14}/></button></div><pre><code>{s.code}</code></pre></div>}{s.tip && <div className="doc-tip">{s.tip}</div>}</article>)}
    </main>
  </div></section>;
}
