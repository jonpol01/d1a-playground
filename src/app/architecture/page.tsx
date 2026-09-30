import type { Metadata } from "next";
import { Architecture } from "@/components/architecture";

export const metadata: Metadata = {
  title: "D1A architecture",
  description: "D1A の仕組み: 入力の並べ方、モデル、2つの実行形式、配信経路、学習、ロードマップ / How D1A works: input layout, model, execution forms, serving path, training and roadmap.",
};

export default function Page() {
  return <Architecture />;
}
