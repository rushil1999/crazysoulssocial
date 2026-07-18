export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="glass rounded-3xl max-w-lg w-full p-10 text-center animate-floaty">
        <div className="text-5xl mb-4">💌</div>
        <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-4">
          <span className="gradient-text">Crazy Souls</span>
        </h1>
        <p className="text-lg text-white/80 mb-6">
          Your matches are curated and waiting — but they can only be unlocked
          from <span className="text-blush font-semibold">your personal link</span>.
        </p>
        <p className="text-white/60 text-sm leading-relaxed">
          Check the message we sent you and open the private link with your name
          on it. See you on the other side. ✨
        </p>
      </div>
    </main>
  );
}
