import { DocsSection } from "@/features/landing/components/DocsSection";
import { Footer } from "@/features/landing/components/Footer";
import { Hero } from "@/features/landing/components/Hero";
import { Nav } from "@/features/landing/components/Nav";
import { StackSection } from "@/features/landing/components/StackSection";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <StackSection />
        <DocsSection />
      </main>
      <Footer />
    </>
  );
}
