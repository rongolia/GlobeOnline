<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/eaf1f7bd-c9cc-4799-b184-39acff9a4d71

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Inspiration

I was impressed by how Google AI Studio could turn a simple game design doc into a playable product, and inspired by a really fun-looking pocket-world terrarium made with AI Studio. Plus, I'm terrible at flags but would always love for fun facts, so why not make a game that makes it fun to learn about the countries around the world?

## What it does

On the map is a spin-the-globe geography game - locate the country, catch the crate, learn something, and have some fun!

- **Locate the country.** From a flag, its most famous product, or even a fun fact, find the country.
- **Catch the crate.** Spin the globe so the right country catches the supply crate.
- **Learn something.** Each find gives you a fun fact about the country - the only way to win is by learning!
- **Have some fun.** Spin the globe, get into the top 10, challenge yourself with hard mode, and keep exploring the world even after the game.

## How we built it

- **Google AI Studio + Firebase Firestore:** the first playable globe and the Firebase connection for the leaderboard.
- **Natural Earth's map data:** country border and location dataset.
- **Three.js:** the low-poly globe and continents, and simple game object models.
- **React + Tailwind CSS:** general web app implementation and styling.
- **Claude:** iteration and polish.

## Challenges we ran into

Our hardest problem was keeping the game engaging for everyone. A flag alone is too hard for some players and too easy for others. We settled on a clue ladder, where each miss gives away a bit more. Scoring rewards you for needing fewer clues, and a find wins back a chance, so a bad streak doesn't end the fun. Random harder openers keep the Medium and Hard modes from feeling predictable.

## Accomplishments that we're proud of

- A globe that's fun to spin.
- A way to learn country flags and fun facts.

## What's next for On the map

- **Music as clues:** hear a country's music and find it on the globe.
- More AI-generated clues to keep the fun going.