import type { ReactNode } from "react";
import { Footer } from "../../components/layout/Footer";
import { Navbar } from "../../components/layout/Navbar";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
