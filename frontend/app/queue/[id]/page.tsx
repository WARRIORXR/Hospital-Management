import QueueClient from "./QueueClient";

export function generateStaticParams() {
  return [{ id: "active" }];
}

export default function Page() {
  return <QueueClient />;
}
