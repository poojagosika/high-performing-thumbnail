import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Features from "../components/Features";
import KeyboardShowcase from "../components/KeyboardShowcase";
import HowItWorks from "../components/HowItWorks";
import Pricing from "../components/Pricing";
import Testimonials from "../components/Testimonials";
import Footer from "../components/Footer";

function Landing() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <KeyboardShowcase />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <Footer />
    </>
  );
}

export default Landing;
