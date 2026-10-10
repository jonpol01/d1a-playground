import type { Metadata } from "next";
import { Learning } from "@/components/learning";

export const metadata: Metadata = {
  title: "D1A learning",
  description: "The self-learning settings and what the loop is doing: outcomes per question, the promotion gate's reports, replay.",
  robots: { index: false },
};

export default function Page() {
  return <Learning />;
}
