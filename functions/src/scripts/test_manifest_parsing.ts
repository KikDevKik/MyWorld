
// --- DATA MODELS ---

interface CharacterSnippet {
  sourceBookId: string;
  sourceBookTitle: string;
  text: string;
}

interface Character {
  id: string; // Slug
  name: string;
  tier: 'MAIN' | 'SUPPORTING';
  sourceType: 'MASTER' | 'LOCAL' | 'HYBRID';
  masterFileId?: string;
  appearances: string[]; // Book IDs
  snippets: CharacterSnippet[];
}

// --- LOGIC UNDER TEST ---

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parsePersonajesMd(content: string, bookId: string, bookTitle: string): Map<string, Partial<Character>> {
  const lines = content.split('\n');
  const found = new Map<string, Partial<Character>>();

  // Regex Patterns
  const wikiLinkRegex = /\[\[(.*?)\]\]/; // Matches [[Name]] or [[Name|Alias]]
  const listRegex = /^[-*]\s+(.*)/; // Matches "- Name" or "* Name"
  const colonRegex = /^([^:]+):\s*(.*)/; // Matches "Name: Description"

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let name = "";
    let description = "";
    let isWiki = false;

    // 1. Try WikiLink [[Name]]
    const wikiMatch = trimmed.match(wikiLinkRegex);
    if (wikiMatch) {
      // Extract content inside [[...]]
      // Handle alias [[RealName|Alias]] -> We usually map to RealName
      const raw = wikiMatch[1];
      if (raw.includes('|')) {
        name = raw.split('|')[0].trim();
      } else {
        name = raw.trim();
      }
      isWiki = true;
      // Check if there is text after the link?
      // "[[Gandalf]] - The Grey Wizard"
      // We might want to capture that description too.
      const afterLink = trimmed.replace(wikiMatch[0], '').trim();
      if (afterLink.startsWith('-') || afterLink.startsWith(':')) {
         description = afterLink.replace(/^[-:]\s*/, '');
      }
    }

    // 2. Try Colon Format "Name: Description" (Only if not wiki, or if wiki failed to capture name?)
    // Actually, if it was a wiki link, we handled it.
    // If not, check colon.
    else {
        const colonMatch = trimmed.match(colonRegex);
        if (colonMatch) {
            // "Name: Description"
            // Exclude if it looks like a header "## Section:"
            if (!trimmed.startsWith('#')) {
                name = colonMatch[1].trim();
                description = colonMatch[2].trim();
                // Clean bullets from name if present "- Name: Desc"
                name = name.replace(/^[-*]\s+/, '');
            }
        } else {
            // 3. Try List Item "- Name" (No description, or description implied?)
            const listMatch = trimmed.match(listRegex);
            if (listMatch) {
                // It is a list item.
                const content = listMatch[1];
                name = content.trim();
            }
        }
    }

    if (name && name.length < 50) { // Safety check: Name shouldn't be a paragraph
        const slug = slugify(name);

        const existing = found.get(slug) || {
            id: slug,
            name: name,
            tier: isWiki ? 'MAIN' : 'SUPPORTING', // Initial guess, can be overridden
            sourceType: 'LOCAL',
            appearances: [bookId],
            snippets: []
        };

        if (description) {
            existing.snippets?.push({
                sourceBookId: bookId,
                sourceBookTitle: bookTitle,
                text: description
            });
        }

        found.set(slug, existing);
    }
  }

  return found;
}


// --- RUN MOCK TEST ---

const mockFileContent = `
# Personajes del Libro 1

## Protagonistas
- [[Megu]]
- [[Arlan|El Paladín]] - Un guerrero cansado.

## Secundarios
* Zog: Un goblin mercader que vende pociones.
* La Panadera: Hace buen pan pero es chismosa.
- [[King Alric]]

## Notas
- Algunos soldados genéricos.
`;

console.log("--- STARTING TEST ---");
const result = parsePersonajesMd(mockFileContent, "book_123", "Libro de Prueba");

result.forEach((char, slug) => {
    console.log(`\nKEY: ${slug}`);
    console.log(`Name: ${char.name}`);
    console.log(`Tier: ${char.tier}`);
    console.log(`Snippets: ${JSON.stringify(char.snippets)}`);
});
