export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="glass rounded-2xl max-w-lg w-full p-10 text-center">
        <div className="text-3xl mb-5 text-gold animate-floaty">✦</div>
        <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-5 tracking-wide">
          <span className="gradient-text">Crazy Souls</span>
        </h1>
        <div className="rule w-24 mx-auto mb-6" />
        <p className="text-lg text-cream/85 mb-6">
          Your match is curated and waiting — but it can only be unlocked from{" "}
          <span className="text-gold font-semibold">your personal link</span>.
        </p>
        <p className="text-beige/80 text-sm leading-relaxed">
          Check the message we sent you and open the private link with your name
          on it. See you on the other side. ✦
        </p>
      </div>
    </main>
  );
}
