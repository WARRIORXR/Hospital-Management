import SectionLoginClient from "./SectionLoginClient";

export function generateStaticParams() {
  return [
    { section: "admin" },
    { section: "hospital" },
    { section: "staff" },
    { section: "patient" },
  ];
}

export default function Page() {
  return <SectionLoginClient />;
}
