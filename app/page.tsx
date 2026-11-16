import { Audience } from "@/components/Audience";
import { Closing } from "@/components/Closing";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { SiteHeader } from "@/components/SiteHeader";
import { Problem } from "@/components/Problem";
import { Trust } from "@/components/Trust";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Audience />
        <Trust />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
