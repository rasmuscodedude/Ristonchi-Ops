export function Mark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#efe4d2" />
      <path
        d="M34 8c2 9 1 16-2 24-7-5-12-2-16 5 7 1 9 7 9 14H16c1-9-4-14-12-16 9-2 12-9 9-18 5 7 10 9 21-9z"
        fill="#3e4a34"
      />
      <path d="M14 54h36" stroke="#9c4030" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function titleCaseTool(name: string): string {
  return name.replaceAll("_", " ");
}
