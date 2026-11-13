import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.film.upsert({
    where: { slug: "skyline-harbor" },
    update: {},
    create: {
      slug: "skyline-harbor",
      title: "Skyline Harbor",
      synopsis: "A rogue pilot and a fading astronomer race across a broken metropolis to prevent a wave of celestial storms from tearing the city apart.",
      genres: ["Sci-Fi", "Action", "Drama"],
      releaseYear: 2026,
      duration: "1h 54m",
      posterUrl: null,
      backdropUrl: null,
      status: "PUBLISHED",
      accessType: "FREE",
      isDemo: true,
      featured: true,
      contentRating: "PG-13",
      trailerVideo: null,
      mainVideoId: null,
      publishedAt: new Date(),
    },
  });

  await prisma.film.upsert({
    where: { slug: "violet-echo" },
    update: {},
    create: {
      slug: "violet-echo",
      title: "Violet Echo",
      synopsis: "In a city built on sound, a deaf composer hears a hidden signal beneath the flood tunnels and discovers a new rhythm for the world.",
      genres: ["Thriller", "Music", "Drama"],
      releaseYear: 2026,
      duration: "1h 41m",
      posterUrl: null,
      backdropUrl: null,
      status: "PUBLISHED",
      accessType: "PREMIUM",
      isDemo: true,
      featured: true,
      contentRating: "TV-14",
      trailerVideo: null,
      mainVideoId: null,
      publishedAt: new Date(),
    },
  });

  await prisma.film.upsert({
    where: { slug: "count-with-milo" },
    update: { featured: false, targetAgeMax: null },
    create: {
      slug: "count-with-milo",
      title: "Count with Milo",
      synopsis: "A curious little fox and a friendly robot explore a colorful garden, counting objects from one to ten through songs, patterns, and simple observation games.",
      genres: ["Education", "Family", "Adventure"],
      releaseYear: 2026,
      duration: "12 min",
      status: "PUBLISHED",
      accessType: "FREE",
      isDemo: true,
      featured: false,
      targetAgeMin: 3,
      learningObjectives: ["Count objects from 1 to 10", "Recognize written numerals 1 to 10", "Practice one-to-one counting"],
      parentNotes: "Fictional sample concept, not an actual production. Suggested for shared viewing with a parent or caregiver; pause to count everyday objects together.",
      mainVideoId: null,
      publishedAt: new Date(),
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
