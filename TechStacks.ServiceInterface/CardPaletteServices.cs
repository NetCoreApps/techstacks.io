using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using ServiceStack;
using ServiceStack.Logging;
using TechStacks.ServiceModel;

namespace TechStacks.ServiceInterface;

public class CardPaletteServices : Service
{
    private static readonly ILog Log = LogManager.GetLogger(typeof(CardPaletteServices));
    private static readonly object FileLock = new();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    public static List<CardPalette> LoadPalettes()
    {
        lock (FileLock)
        {
            try
            {
                string? json = null;
                if (HostContext.VirtualFiles != null && HostContext.VirtualFiles.FileExists("App_Data/card-palettes.json"))
                {
                    json = HostContext.VirtualFiles.GetFile("App_Data/card-palettes.json")?.ReadAllText();
                }
                else
                {
                    var fallbackPath = Path.Combine(AppContext.BaseDirectory, "App_Data", "card-palettes.json");
                    if (File.Exists(fallbackPath))
                    {
                        json = File.ReadAllText(fallbackPath);
                    }
                }

                if (!string.IsNullOrEmpty(json))
                {
                    var list = JsonSerializer.Deserialize<List<CardPalette>>(json, JsonOptions);
                    if (list != null && list.Count > 0)
                        return list;
                }
            }
            catch (Exception ex)
            {
                Log.Error("Error loading card-palettes.json", ex);
            }
            return PostCardRenderer.DefaultPalettes;
        }
    }

    public static void SavePalettesList(List<CardPalette> palettes)
    {
        lock (FileLock)
        {
            var json = JsonSerializer.Serialize(palettes, JsonOptions);
            try
            {
                if (HostContext.VirtualFiles != null)
                {
                    HostContext.VirtualFiles.WriteFile("App_Data/card-palettes.json", json);
                    return;
                }
            }
            catch
            {
                // Fallback for tests / offline
            }

            var fallbackDir = Path.Combine(AppContext.BaseDirectory, "App_Data");
            if (!Directory.Exists(fallbackDir))
            {
                Directory.CreateDirectory(fallbackDir);
            }
            File.WriteAllText(Path.Combine(fallbackDir, "card-palettes.json"), json);
        }
    }

    public object Get(GetCardPalettes request)
    {
        return new HttpResult(LoadPalettes(), MimeTypes.Json);
    }

    public object Post(SaveCardPalettes request)
    {
        if (request.Palettes == null || request.Palettes.Count == 0)
            throw HttpError.BadRequest("Palettes list cannot be empty");

        SavePalettesList(request.Palettes);
        return new HttpResult(LoadPalettes(), MimeTypes.Json);
    }

    public async Task Get(GetCardPreviewSvg request)
    {
        var palette = new CardPalette
        {
            BgStart = !string.IsNullOrWhiteSpace(request.BgStart) ? request.BgStart : "#4f46e5",
            BgEnd = !string.IsNullOrWhiteSpace(request.BgEnd) ? request.BgEnd : "#312e81",
            TitleColor = !string.IsNullOrWhiteSpace(request.TitleColor) ? request.TitleColor : "#ffffff",
            DomainColor = !string.IsNullOrWhiteSpace(request.DomainColor) ? request.DomainColor : "#ffffff",
            AccentColor = !string.IsNullOrWhiteSpace(request.AccentColor) ? request.AccentColor : "#818cf8",
        };

        var title = !string.IsNullOrWhiteSpace(request.Title) ? request.Title : "Building Modern Web Apps with ServiceStack and React";
        var tags = !string.IsNullOrWhiteSpace(request.Tags) 
            ? request.Tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : new[] { "servicestack", "react", "dotnet", "web" };

        var svg = PostCardRenderer.RenderSvg(title, tags, palette);
        Response.ContentType = MimeTypes.GetMimeType("svg");
        await Response.WriteAsync(svg);
        Response.EndRequest();
    }

    public object Get(GetCardDesignerPage request)
    {
        var html = @"<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>Poster Card Palette Designer - TechStacks</title>
    <script src=""https://cdn.tailwindcss.com""></script>
    <style>
        body { background-color: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
        .card-preview svg { width: 100%; height: auto; border-radius: 0.75rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4); }
    </style>
</head>
<body class=""p-6 max-w-7xl mx-auto"">
    <header class=""mb-8 border-b border-slate-800 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"">
        <div>
            <h1 class=""text-3xl font-extrabold text-white tracking-tight"">Poster Card Palette Designer</h1>
            <p class=""text-slate-400 text-sm mt-1"">Explore background gradients and text color combinations for techstacks.io social share cards.</p>
        </div>
        <div class=""flex items-center gap-3"">
            <button id=""btnSave"" onclick=""saveSelectedPalettes()"" class=""px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-md transition-all flex items-center gap-2"">
                <svg class=""w-5 h-5"" fill=""none"" stroke=""currentColor"" viewBox=""0 0 24 24""><path stroke-linecap=""round"" stroke-linejoin=""round"" stroke-width=""2"" d=""M5 13l4 4L19 7""></path></svg>
                Save Selected Palettes (<span id=""selectedCount"">0</span>)
            </button>
        </div>
    </header>

    <!-- Controls -->
    <div class=""bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8 shadow-lg"">
        <h2 class=""text-lg font-bold text-white mb-4"">Sample Post Input</h2>
        <div class=""grid grid-cols-1 md:grid-cols-2 gap-4"">
            <div>
                <label class=""block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1"">Post Title</label>
                <input type=""text"" id=""inputTitle"" value=""Migrating Legacy .NET Apps to Next.js 16 and ServiceStack"" oninput=""renderCards()"" 
                    class=""w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"">
            </div>
            <div>
                <label class=""block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1"">Tags (comma separated)</label>
                <input type=""text"" id=""inputTags"" value=""dotnet, nextjs, react, servicestack"" oninput=""renderCards()"" 
                    class=""w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"">
            </div>
        </div>
    </div>

    <!-- Status Message -->
    <div id=""statusMsg"" class=""hidden mb-6 p-4 rounded-lg text-sm font-medium transition-all""></div>

    <!-- Gallery Grid -->
    <div id=""paletteGrid"" class=""grid grid-cols-1 md:grid-cols-2 gap-8""></div>

    <script>
        const PRESET_PALETTES = [
            { id: 'slate', name: 'Slate', bgStart: '#475569', bgEnd: '#0f172a', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#94a3b8' },
            { id: 'gray', name: 'Gray', bgStart: '#4b5563', bgEnd: '#111827', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#9ca3af' },
            { id: 'zinc', name: 'Zinc', bgStart: '#52525b', bgEnd: '#18181b', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#a1a1aa' },
            { id: 'neutral', name: 'Neutral', bgStart: '#525252', bgEnd: '#171717', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#a3a3a3' },
            { id: 'stone', name: 'Stone', bgStart: '#57534e', bgEnd: '#1c1917', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#a8a29e' },
            { id: 'red', name: 'Red', bgStart: '#dc2626', bgEnd: '#7f1d1d', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#fca5a5' },
            { id: 'orange', name: 'Orange', bgStart: '#ea580c', bgEnd: '#7c2d12', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#fdba74' },
            { id: 'amber', name: 'Amber', bgStart: '#d97706', bgEnd: '#78350f', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#fde047' },
            { id: 'yellow', name: 'Yellow', bgStart: '#ca8a04', bgEnd: '#713f12', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#fef08a' },
            { id: 'lime', name: 'Lime', bgStart: '#65a30d', bgEnd: '#365314', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#bef264' },
            { id: 'green', name: 'Green', bgStart: '#16a34a', bgEnd: '#14532d', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#86efac' },
            { id: 'emerald', name: 'Emerald', bgStart: '#059669', bgEnd: '#064e3b', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#6ee7b7' },
            { id: 'teal', name: 'Teal', bgStart: '#0d9488', bgEnd: '#134e4a', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#5eead4' },
            { id: 'cyan', name: 'Cyan', bgStart: '#0891b2', bgEnd: '#164e63', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#67e8f9' },
            { id: 'sky', name: 'Sky', bgStart: '#0284c7', bgEnd: '#0c4a6e', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#7dd3fc' },
            { id: 'blue', name: 'Blue', bgStart: '#2563eb', bgEnd: '#1e3a8a', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#93c5fd' },
            { id: 'indigo', name: 'Indigo', bgStart: '#4f46e5', bgEnd: '#312e81', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#a5b4fc' },
            { id: 'violet', name: 'Violet', bgStart: '#7c3aed', bgEnd: '#4c1d95', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#c4b5fd' },
            { id: 'purple', name: 'Purple', bgStart: '#9333ea', bgEnd: '#581c87', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#d8b4fe' },
            { id: 'fuchsia', name: 'Fuchsia', bgStart: '#c026d3', bgEnd: '#701a75', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#f0abfc' },
            { id: 'pink', name: 'Pink', bgStart: '#db2777', bgEnd: '#831843', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#f472b6' },
            { id: 'rose', name: 'Rose', bgStart: '#e11d48', bgEnd: '#881337', titleColor: '#ffffff', domainColor: '#ffffff', accentColor: '#fda4af' }
        ];

        let selectedIds = new Set();

        async function init() {
            try {
                const res = await fetch('/cards/palettes', {
                    headers: { 'Accept': 'application/json' }
                });
                const contentType = res.headers.get('content-type') || '';
                if (res.ok && contentType.includes('application/json')) {
                    const saved = await res.json();
                    if (Array.isArray(saved) && saved.length > 0) {
                        selectedIds.clear();
                        saved.forEach(p => {
                            const pid = p.id || p.Id;
                            if (pid) selectedIds.add(pid);
                        });
                    }
                }
            } catch (e) {
                console.warn('Could not load saved palettes', e);
            }
            if (selectedIds.size === 0) {
                PRESET_PALETTES.slice(0, 8).forEach(p => selectedIds.add(p.id));
            }
            renderCards();
        }

        function toggleSelect(id) {
            if (selectedIds.has(id)) {
                selectedIds.delete(id);
            } else {
                selectedIds.add(id);
            }
            updateCount();
            renderCards();
        }

        function updateCount() {
            document.getElementById('selectedCount').innerText = selectedIds.size;
        }

        async function renderCards() {
            updateCount();
            const title = document.getElementById('inputTitle').value;
            const tags = document.getElementById('inputTags').value;
            const grid = document.getElementById('paletteGrid');
            grid.innerHTML = '';

            for (const palette of PRESET_PALETTES) {
                const isSelected = selectedIds.has(palette.id);
                const params = new URLSearchParams({
                    title: title,
                    tags: tags,
                    bgStart: palette.bgStart,
                    bgEnd: palette.bgEnd,
                    titleColor: palette.titleColor,
                    domainColor: palette.domainColor,
                    accentColor: palette.accentColor
                });
                
                const cardWrapper = document.createElement('div');
                cardWrapper.className = `bg-slate-900 border ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-slate-800'} rounded-xl overflow-hidden transition-all duration-200 shadow-lg cursor-pointer`;
                cardWrapper.onclick = (e) => {
                    if (e.target.tagName !== 'INPUT') {
                        toggleSelect(palette.id);
                    }
                };

                cardWrapper.innerHTML = `
                    <div class=""p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between"">
                        <div class=""flex items-center gap-3"">
                            <input type=""checkbox"" ${isSelected ? 'checked' : ''} onchange=""toggleSelect('${palette.id}')"" 
                                class=""w-5 h-5 accent-indigo-600 rounded cursor-pointer"">
                            <span class=""font-bold text-white text-base select-none"">${palette.name}</span>
                        </div>
                        <div class=""flex items-center gap-1.5"">
                            <span class=""w-4 h-4 rounded-full inline-block"" style=""background:${palette.bgStart}""></span>
                            <span class=""w-4 h-4 rounded-full inline-block"" style=""background:${palette.bgEnd}""></span>
                        </div>
                    </div>
                    <div class=""p-4 bg-slate-900 flex justify-center items-center"">
                        <img src=""/cards/preview.svg?${params.toString()}"" class=""w-full h-auto rounded-lg shadow-md border border-slate-800/80 cursor-pointer select-none"" alt=""${palette.name}"">
                    </div>
                `;
                grid.appendChild(cardWrapper);
            }
        }

        async function saveSelectedPalettes() {
            const selectedList = PRESET_PALETTES.filter(p => selectedIds.has(p.id));
            if (selectedList.length === 0) {
                showStatus('Please select at least one palette to save.', true);
                return;
            }

            try {
                const res = await fetch('/cards/palettes', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json' 
                    },
                    body: JSON.stringify({ palettes: selectedList })
                });

                if (res.ok) {
                    showStatus(`Successfully saved ${selectedList.length} palette(s) to App_Data/card-palettes.json!`, false);
                } else {
                    showStatus('Failed to save palettes: ' + res.statusText, true);
                }
            } catch (err) {
                showStatus('Error saving palettes: ' + err.message, true);
            }
        }

        function showStatus(msg, isError) {
            const el = document.getElementById('statusMsg');
            el.innerText = msg;
            el.className = `mb-6 p-4 rounded-lg text-sm font-semibold ${isError ? 'bg-red-900/40 text-red-300 border border-red-800' : 'bg-emerald-900/40 text-emerald-300 border border-emerald-800'}`;
            el.classList.remove('hidden');
            setTimeout(() => el.classList.add('hidden'), 5000);
        }

        init();
    </script>
</body>
</html>";
        return new HttpResult(html, MimeTypes.GetMimeType("html"));
    }
}
