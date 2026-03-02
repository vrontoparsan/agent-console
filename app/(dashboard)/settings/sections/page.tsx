"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  Plus,
  FileText,
  FolderOpen,
  ExternalLink,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Section = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  order: number;
  categoryId: string | null;
};

type Category = {
  id: string;
  name: string;
  order: number;
  pages: Section[];
};

// ─── Sortable Section Row ──────────────────────────────────
function SortableSectionRow({
  section,
  indented,
  deleting,
  onDelete,
}: {
  section: Section;
  indented?: boolean;
  deleting: string | null;
  onDelete: (id: string, title: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border p-3 bg-background transition-colors",
        indented && "ml-8",
        isDragging && "opacity-50 shadow-lg z-10"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <FileText className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{section.title}</span>
          {section.published ? (
            <Badge variant="default" className="text-[10px] h-5">Pub</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] h-5">Draft</Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">/p/{section.slug}</span>
      </div>
      <Link href={`/p/${section.slug}`}>
        <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
          <ExternalLink className="h-3 w-3" />
          Otvoriť
        </Button>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(section.id, section.title)}
        disabled={deleting === section.id}
      >
        {deleting === section.id ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

// ─── Sortable Category Group ───────────────────────────────
function SortableCategoryGroup({
  category,
  deleting,
  onDeleteSection,
  onDeleteCategory,
  allSectionIds,
}: {
  category: Category;
  deleting: string | null;
  onDeleteSection: (id: string, title: string) => void;
  onDeleteCategory: (id: string, name: string) => void;
  allSectionIds: string[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `cat-${category.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50 shadow-lg z-10")}>
      {/* Category header */}
      <div className="flex items-center gap-3 rounded-lg border border-border p-3 bg-muted/30">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <FolderOpen className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium flex-1">{category.name}</span>
        <span className="text-[11px] text-muted-foreground">{category.pages.length} sekcií</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onDeleteCategory(category.id, category.name)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Category children */}
      {!collapsed && (
        <div className="mt-1.5 space-y-1.5">
          <SortableContext items={allSectionIds} strategy={verticalListSortingStrategy}>
            {category.pages.map((section) => (
              <SortableSectionRow
                key={section.id}
                section={section}
                indented
                deleting={deleting}
                onDelete={onDeleteSection}
              />
            ))}
          </SortableContext>
          {category.pages.length === 0 && (
            <p className="ml-8 text-xs text-muted-foreground py-2">Žiadne sekcie v tejto kategórii</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function ManageSectionsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [uncategorized, setUncategorized] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Create forms
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [creating, setCreating] = useState(false);

  // Admin toggle
  const [allowAdminUIAgent, setAllowAdminUIAgent] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadData = useCallback(async () => {
    try {
      const [catRes, pagesRes] = await Promise.all([
        fetch("/api/pages/categories"),
        fetch("/api/pages?all=1"),
      ]);
      if (catRes.ok && pagesRes.ok) {
        const cats: Category[] = await catRes.json();
        const allPages: Section[] = await pagesRes.json();

        // Pages not in any category
        const catPageIds = new Set(cats.flatMap((c) => c.pages.map((p) => p.id)));
        const uncatPages = allPages
          .filter((p) => !catPageIds.has(p.id) && !p.categoryId)
          .sort((a, b) => a.order - b.order);

        setCategories(cats);
        setUncategorized(uncatPages);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/company");
      if (res.ok) {
        const data = await res.json();
        setAllowAdminUIAgent(!!(data.extra as Record<string, unknown>)?.allowAdminUIAgent);
      }
    } catch { /* ignore */ }
    setSettingsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    loadSettings();
  }, [loadData, loadSettings]);

  async function handleCreateSection() {
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        setNewTitle("");
        setShowCreateSection(false);
        await loadData();
      }
    } catch { /* ignore */ }
    setCreating(false);
  }

  async function handleCreateCategory() {
    if (!newCatName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/pages/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      if (res.ok) {
        setNewCatName("");
        setShowCreateCategory(false);
        await loadData();
      }
    } catch { /* ignore */ }
    setCreating(false);
  }

  async function handleDeleteSection(id: string, title: string) {
    if (!confirm(`Naozaj chceš vymazať sekciu "${title}"? Táto akcia je nevratná.`)) return;
    setDeleting(id);
    try {
      await fetch(`/api/pages?id=${id}`, { method: "DELETE" });
      await loadData();
    } catch { /* ignore */ }
    setDeleting(null);
  }

  async function handleDeleteCategory(id: string, name: string) {
    if (!confirm(`Vymazať kategóriu "${name}"? Sekcie budú presunuté do nekategorizovaných.`)) return;
    try {
      await fetch(`/api/pages/categories?id=${id}`, { method: "DELETE" });
      await loadData();
    } catch { /* ignore */ }
  }

  async function handleToggleAdminUIAgent() {
    const newValue = !allowAdminUIAgent;
    setAllowAdminUIAgent(newValue);
    try {
      const res = await fetch("/api/settings/company");
      if (res.ok) {
        const data = await res.json();
        const extra = (data.extra as Record<string, unknown>) || {};
        await fetch("/api/settings/company", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, extra: { ...extra, allowAdminUIAgent: newValue } }),
        });
      }
    } catch { /* ignore */ }
  }

  // ─── DnD handler ──────────────────────────────────────
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Category reorder
    if (activeId.startsWith("cat-") && overId.startsWith("cat-")) {
      const oldIdx = categories.findIndex((c) => `cat-${c.id}` === activeId);
      const newIdx = categories.findIndex((c) => `cat-${c.id}` === overId);
      if (oldIdx === -1 || newIdx === -1) return;

      const reordered = arrayMove(categories, oldIdx, newIdx);
      setCategories(reordered);

      await fetch("/api/pages/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reordered.map((c, i) => ({ id: c.id, order: i }))),
      });
      return;
    }

    // Section reorder (flat: uncategorized + all category pages)
    if (!activeId.startsWith("cat-") && !overId.startsWith("cat-")) {
      // Build flat list of all sections
      const allSections = [
        ...uncategorized.map((s) => ({ ...s, categoryId: null as string | null })),
        ...categories.flatMap((c) =>
          c.pages.map((p) => ({ ...p, categoryId: c.id }))
        ),
      ];

      const oldIdx = allSections.findIndex((s) => s.id === activeId);
      const newIdx = allSections.findIndex((s) => s.id === overId);
      if (oldIdx === -1 || newIdx === -1) return;

      const reordered = arrayMove(allSections, oldIdx, newIdx);

      // Determine new categoryId: the moved item takes the category of its new neighbor
      const movedItem = reordered[newIdx];
      // Find which category section the item landed near
      let newCategoryId: string | null = null;
      if (newIdx > 0) {
        newCategoryId = reordered[newIdx - 1].categoryId;
      }
      // Or if dropped at position 0 and it's in uncategorized area
      if (newIdx === 0 && uncategorized.length > 0) {
        newCategoryId = null;
      }

      movedItem.categoryId = newCategoryId;

      // Save to API
      await fetch("/api/pages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reordered.map((s, i) => ({ id: s.id, order: i, categoryId: s.categoryId }))
        ),
      });

      await loadData();
    }
  }

  // All sortable IDs
  const allSortableIds = [
    ...uncategorized.map((s) => s.id),
    ...categories.flatMap((c) => [`cat-${c.id}`, ...c.pages.map((p) => p.id)]),
  ];

  const allSectionIds = [
    ...uncategorized.map((s) => s.id),
    ...categories.flatMap((c) => c.pages.map((p) => p.id)),
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Spravovať Sekcie</h1>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => { setShowCreateCategory(true); setShowCreateSection(false); }}
          >
            <Plus className="h-3.5 w-3.5" />
            Kategória
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { setShowCreateSection(true); setShowCreateCategory(false); }}
          >
            <Plus className="h-3.5 w-3.5" />
            Sekcia
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
          {/* Admin toggle */}
          {!settingsLoading && (
            <label className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 cursor-pointer">
              <input
                type="checkbox"
                checked={allowAdminUIAgent}
                onChange={handleToggleAdminUIAgent}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm">Povoliť Adminovi editovať sekcie cez UI Agent</span>
            </label>
          )}

          {/* Create section form */}
          {showCreateSection && (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3 bg-muted/30">
              <Input
                placeholder="Názov sekcie..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateSection();
                  if (e.key === "Escape") { setShowCreateSection(false); setNewTitle(""); }
                }}
                className="flex-1"
                autoFocus
                disabled={creating}
              />
              <Button size="sm" onClick={handleCreateSection} disabled={!newTitle.trim() || creating}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vytvoriť"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreateSection(false); setNewTitle(""); }}>
                Zrušiť
              </Button>
            </div>
          )}

          {/* Create category form */}
          {showCreateCategory && (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3 bg-muted/30">
              <Input
                placeholder="Názov kategórie..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCategory();
                  if (e.key === "Escape") { setShowCreateCategory(false); setNewCatName(""); }
                }}
                className="flex-1"
                autoFocus
                disabled={creating}
              />
              <Button size="sm" onClick={handleCreateCategory} disabled={!newCatName.trim() || creating}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vytvoriť"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreateCategory(false); setNewCatName(""); }}>
                Zrušiť
              </Button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty state */}
          {!loading && uncategorized.length === 0 && categories.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Žiadne sekcie. Vytvor novú sekciu alebo kategóriu.</p>
            </div>
          )}

          {/* Tree DnD */}
          {!loading && (uncategorized.length > 0 || categories.length > 0) && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {/* Uncategorized sections */}
                  {uncategorized.map((section) => (
                    <SortableSectionRow
                      key={section.id}
                      section={section}
                      deleting={deleting}
                      onDelete={handleDeleteSection}
                    />
                  ))}

                  {/* Categories with their sections */}
                  {categories.map((category) => (
                    <SortableCategoryGroup
                      key={category.id}
                      category={category}
                      deleting={deleting}
                      onDeleteSection={handleDeleteSection}
                      onDeleteCategory={handleDeleteCategory}
                      allSectionIds={allSectionIds}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}
