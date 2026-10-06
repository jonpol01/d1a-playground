import type { Metadata } from "next";
import { Review } from "@/components/review";

export const metadata: Metadata = {
  title: "D1A PR label check",
  description: "Check the PR labeler's labels by hand: D1A against the review bot, answers recorded as human outcomes.",
  robots: { index: false },
};

export default function Page() {
  return <Review />;
}
