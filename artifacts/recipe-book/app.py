import os
import json
import re
import markdown as md
from flask import Flask, request, jsonify, send_from_directory, abort

app = Flask(__name__, static_folder="static", template_folder="templates")

@app.after_request
def no_cache(response):
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

RECIPE_FILE = os.path.join(os.path.dirname(__file__), "recipe_book.md")
BOOKMARKS_FILE = os.path.join(os.path.dirname(__file__), "bookmarks.json")


def load_bookmarks():
    if os.path.exists(BOOKMARKS_FILE):
        with open(BOOKMARKS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_bookmarks(bookmarks):
    with open(BOOKMARKS_FILE, "w", encoding="utf-8") as f:
        json.dump(bookmarks, f, ensure_ascii=False, indent=2)


def parse_recipes():
    if not os.path.exists(RECIPE_FILE):
        return []
    with open(RECIPE_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    # Find all top-level # Section headers
    section_pattern = re.compile(r"^#\s+(.+)$", re.MULTILINE)
    section_matches = list(section_pattern.finditer(content))

    recipes = []
    pattern = re.compile(
        r"^(##\s+Recipe\s+(\d+)\s*[—\-–]\s*(.+?))$",
        re.MULTILINE
    )
    matches = list(pattern.finditer(content))

    for i, match in enumerate(matches):
        # Determine which section this recipe falls under
        recipe_pos = match.start()
        current_section = ""
        for sm in section_matches:
            if sm.start() < recipe_pos:
                name = sm.group(1).strip()
                # Strip "SECTION N — " prefix (e.g. "SECTION 1 — Breakfasts: Savory" → "Breakfasts: Savory")
                name = re.sub(r'^SECTION\s+\d+\s*[—\-–]\s*', '', name).strip()
                current_section = name
            else:
                break

        number = int(match.group(2))
        title = match.group(3).strip()

        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        full_block = content[start:end].strip()

        lines = full_block.split("\n")
        tag_line = ""
        for line in lines[1:]:
            stripped = line.strip()
            if stripped.startswith("**") and stripped.endswith("**"):
                tag_line = stripped.strip("*").strip()
                break
            elif stripped:
                tag_line = re.sub(r"\*+", "", stripped).strip()
                break

        ingredients_text = ""
        in_ingredients = False
        for line in lines:
            stripped = line.strip()
            # Detect an ingredients heading in many formats:
            # ## Ingredients, **Ingredients**, Ingredients:, ### 🥘 Ingredients, etc.
            clean = re.sub(r"[#*_:`>~\U0001F300-\U0001FFFF]", "", stripped).strip()
            if re.match(r"ingredients?\b", clean, re.IGNORECASE) and not in_ingredients:
                in_ingredients = True
                continue
            if in_ingredients:
                # Stop when we hit any non-ingredients section heading
                is_md_heading = re.match(r"#+\s+\S", line)
                is_bold_heading = re.match(r"\*\*[^*]+\*\*\s*$", stripped) and len(stripped) < 60
                if is_md_heading or is_bold_heading:
                    clean2 = re.sub(r"[#*_:`>~\U0001F300-\U0001FFFF]", "", stripped).strip()
                    if not re.match(r"ingredients?\b", clean2, re.IGNORECASE):
                        break
                ingredients_text += line + "\n"

        recipes.append({
            "number": number,
            "title": title,
            "tags": tag_line,
            "section": current_section,
            "ingredients_text": ingredients_text.strip(),
            "full_markdown": full_block,
        })

    return recipes


@app.route("/")
def index():
    return send_from_directory("templates", "index.html")


@app.route("/api/recipes")
def get_recipes():
    recipes = parse_recipes()
    return jsonify([
        {"number": r["number"], "title": r["title"], "tags": r["tags"], "section": r["section"]}
        for r in recipes
    ])


@app.route("/api/recipe/<int:number>")
def get_recipe(number):
    recipes = parse_recipes()
    for r in recipes:
        if r["number"] == number:
            html_content = md.markdown(
                r["full_markdown"],
                extensions=["extra", "nl2br"]
            )
            return jsonify({
                "number": r["number"],
                "title": r["title"],
                "tags": r["tags"],
                "html": html_content,
            })
    abort(404)


@app.route("/api/search")
def search_ingredient():
    query = request.args.get("ingredient", "").strip().lower()
    if not query:
        return jsonify([])
    recipes = parse_recipes()
    results = []
    for r in recipes:
        text = r["ingredients_text"]
        if query in text.lower():
            matched_lines = [
                re.sub(r"^[\-\*\+]\s*", "", line).strip()
                for line in text.split("\n")
                if query in line.lower() and line.strip()
            ]
            results.append({
                "number": r["number"],
                "title": r["title"],
                "tags": r["tags"],
                "matched": matched_lines[:3],
            })
    return jsonify(results)


@app.route("/api/bookmark", methods=["POST"])
def toggle_bookmark():
    data = request.get_json()
    title = data.get("title", "").strip()
    number = data.get("number")
    if not title:
        return jsonify({"error": "title required"}), 400
    bookmarks = load_bookmarks()
    existing = next((b for b in bookmarks if b["title"] == title), None)
    if existing:
        bookmarks = [b for b in bookmarks if b["title"] != title]
        save_bookmarks(bookmarks)
        return jsonify({"bookmarked": False, "title": title})
    else:
        bookmarks.append({"title": title, "number": number})
        save_bookmarks(bookmarks)
        return jsonify({"bookmarked": True, "title": title})


@app.route("/api/bookmarks")
def get_bookmarks():
    return jsonify(load_bookmarks())


@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not f.filename.endswith(".md"):
        return jsonify({"error": "Only .md files are accepted"}), 400
    f.save(RECIPE_FILE)
    recipes = parse_recipes()
    return jsonify({"success": True, "count": len(recipes), "filename": f.filename})


@app.route("/api/file-status")
def file_status():
    if os.path.exists(RECIPE_FILE):
        return jsonify({"uploaded": True, "filename": "recipe_book.md"})
    return jsonify({"uploaded": False})


@app.route("/api/remove-file", methods=["POST"])
def remove_file():
    if os.path.exists(RECIPE_FILE):
        os.remove(RECIPE_FILE)
    return jsonify({"success": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    app.run(host="0.0.0.0", port=port, debug=False)
