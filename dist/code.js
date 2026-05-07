"use strict";
(() => {
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/types.ts
  var ROOT_FRAME_NAME_DEFAULT = "\u041F\u043E \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044E";
  var UNCATEGORIZED_FRAME_NAME = "\u041D\u041E\u0412\u042B\u0415 \u0418\u041A\u041E\u041D\u041A\u0418";

  // src/code.ts
  figma.showUI(__html__, { width: 320, height: 540, title: "Icon Management" });
  function send(msg) {
    figma.ui.postMessage(msg);
  }
  function parseMetadata(json) {
    if (!json) return null;
    try {
      const p = JSON.parse(json);
      if (typeof p.name === "string" && Array.isArray(p.sizes) && Array.isArray(p.tags) && Array.isArray(p.categories)) {
        return {
          name: p.name,
          sizes: p.sizes.map(String),
          tags: p.tags,
          styles: Array.isArray(p.styles) ? p.styles : [],
          categories: p.categories
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  function resolveComponentSet() {
    var _a;
    const sel = figma.currentPage.selection;
    if (sel.length !== 1) return null;
    const node = sel[0];
    if (node.type === "COMPONENT_SET") return node;
    if (node.type === "COMPONENT" && ((_a = node.parent) == null ? void 0 : _a.type) === "COMPONENT_SET") {
      return node.parent;
    }
    return null;
  }
  function extractSizesFromNode(node) {
    const defs = node.componentPropertyDefinitions;
    const sizeKey = Object.keys(defs).find((k) => k.toLowerCase() === "size");
    if (!sizeKey) return [];
    const prop = defs[sizeKey];
    if (prop.type !== "VARIANT" || !prop.variantOptions) return [];
    return prop.variantOptions.map((v) => v.trim()).filter(Boolean);
  }
  function extractStylesFromNode(node) {
    const defs = node.componentPropertyDefinitions;
    const styleKey = Object.keys(defs).find((k) => k.toLowerCase() === "style");
    if (!styleKey) return [];
    const prop = defs[styleKey];
    if (prop.type !== "VARIANT" || !prop.variantOptions) return [];
    return prop.variantOptions.map((v) => v.trim()).filter(Boolean);
  }
  function extractTagsFromNode(node) {
    if (!node.description) return [];
    return node.description.split(",").map((t) => t.trim()).filter(Boolean);
  }
  function handleGetSelection() {
    const node = resolveComponentSet();
    if (!node) {
      const isEmpty = figma.currentPage.selection.length === 0;
      send(isEmpty ? { type: "NO_SELECTION" } : { type: "INVALID_SELECTION" });
      return;
    }
    let metadata = parseMetadata(node.getPluginData("iconset_metadata"));
    if (!metadata) {
      metadata = {
        name: node.name,
        sizes: extractSizesFromNode(node),
        tags: extractTagsFromNode(node),
        styles: extractStylesFromNode(node),
        categories: []
      };
    }
    const data = { nodeId: node.id, nodeName: node.name, metadata };
    send({ type: "SELECTION_DATA", data });
  }
  function handleSaveMetadata(nodeId, metadata) {
    const node = figma.getNodeById(nodeId);
    if (!node || node.type !== "COMPONENT_SET") {
      send({ type: "RELEASE_ERROR", message: "Node not found" });
      return;
    }
    node.setPluginData("iconset_metadata", JSON.stringify(metadata));
    send({ type: "SAVE_DONE" });
  }
  function handleGetSettings() {
    const name = figma.root.getPluginData("root_frame_name") || ROOT_FRAME_NAME_DEFAULT;
    send({ type: "SETTINGS_DATA", rootFrameName: name });
  }
  function handleSaveSettings(name) {
    figma.root.setPluginData("root_frame_name", name);
    send({ type: "SETTINGS_SAVED" });
  }
  function findRootFrame() {
    const found = figma.currentPage.findAll((n) => n.getPluginData("is_root_frame") === "true");
    return found.length > 0 && found[0].type === "FRAME" ? found[0] : null;
  }
  function handleRemoveIconset(nodeId) {
    const node = figma.getNodeById(nodeId);
    if (node && node.type === "COMPONENT_SET") {
      node.setPluginData("iconset_metadata", "");
    }
    const rootFrame = findRootFrame();
    if (!rootFrame) {
      send({ type: "REMOVE_DONE" });
      return;
    }
    for (const catChild of [...rootFrame.children]) {
      if (catChild.type !== "FRAME" || !catChild.getPluginData("is_category_frame")) continue;
      const catFrame = catChild;
      let removedAny = false;
      for (const card of [...catFrame.children]) {
        if (card.getPluginData("source_id") === nodeId) {
          card.remove();
          removedAny = true;
        }
      }
      if (removedAny) {
        const remaining = catFrame.children.filter((c) => c.getPluginData("source_id"));
        if (remaining.length === 0) catFrame.remove();
      }
    }
    send({ type: "REMOVE_DONE" });
  }
  function findVariant24(children) {
    for (const child of children) {
      if (child.type === "COMPONENT" && Math.round(child.width) === 24) {
        return child;
      }
    }
    return children.length > 0 && children[0].type === "COMPONENT" ? children[0] : null;
  }
  function buildCategoryMap(iconSets) {
    const map = /* @__PURE__ */ new Map();
    for (const item of iconSets) {
      if (item.metadata.categories.length === 0) {
        if (!map.has(UNCATEGORIZED_FRAME_NAME)) map.set(UNCATEGORIZED_FRAME_NAME, []);
        map.get(UNCATEGORIZED_FRAME_NAME).push(item);
      } else {
        for (const cat of item.metadata.categories) {
          if (!map.has(cat)) map.set(cat, []);
          map.get(cat).push(item);
        }
      }
    }
    return map;
  }
  function createShortCard(componentSet, metadata, category, isUncategorized) {
    return __async(this, null, function* () {
      const card = figma.createFrame();
      card.name = metadata.name;
      card.layoutMode = "HORIZONTAL";
      card.itemSpacing = 12;
      card.paddingLeft = 8;
      card.paddingRight = 12;
      card.paddingTop = 8;
      card.paddingBottom = 8;
      card.counterAxisAlignItems = "CENTER";
      card.primaryAxisSizingMode = "AUTO";
      card.counterAxisSizingMode = "AUTO";
      card.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      card.cornerRadius = 8;
      card.setPluginData("source_id", componentSet.id);
      card.setPluginData("card_category", category);
      const iconBox = figma.createFrame();
      iconBox.resize(48, 48);
      iconBox.fills = [{ type: "SOLID", color: { r: 0.961, g: 0.961, b: 0.961 } }];
      iconBox.cornerRadius = 6;
      iconBox.clipsContent = true;
      iconBox.layoutMode = "NONE";
      const variant = findVariant24(componentSet.children);
      if (variant) {
        const instance = variant.createInstance();
        iconBox.appendChild(instance);
        instance.x = Math.round((48 - instance.width) / 2);
        instance.y = Math.round((48 - instance.height) / 2);
      }
      card.appendChild(iconBox);
      const textCol = figma.createFrame();
      textCol.layoutMode = "VERTICAL";
      textCol.itemSpacing = 2;
      textCol.fills = [];
      textCol.primaryAxisSizingMode = "AUTO";
      textCol.counterAxisSizingMode = "AUTO";
      const nameText = figma.createText();
      nameText.fontName = { family: "Inter", style: "Bold" };
      nameText.fontSize = 14;
      nameText.characters = metadata.name || "(unnamed)";
      nameText.fills = [{ type: "SOLID", color: { r: 0.07, g: 0.07, b: 0.07 } }];
      textCol.appendChild(nameText);
      if (metadata.tags.length > 0) {
        const tagsText = figma.createText();
        tagsText.fontName = { family: "Inter", style: "Regular" };
        tagsText.fontSize = 12;
        tagsText.characters = metadata.tags.join(", ");
        tagsText.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
        textCol.appendChild(tagsText);
      }
      if (metadata.styles.length > 0) {
        const stylesText = figma.createText();
        stylesText.fontName = { family: "Inter", style: "Regular" };
        stylesText.fontSize = 12;
        stylesText.characters = metadata.styles.join(", ");
        stylesText.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
        textCol.appendChild(stylesText);
      }
      const sizesStr = metadata.sizes.length > 0 ? metadata.sizes.join(" ") : "\u2014";
      const sizesText = figma.createText();
      sizesText.fontName = { family: "Inter", style: "Regular" };
      sizesText.fontSize = 12;
      sizesText.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
      if (!isUncategorized) {
        sizesText.characters = sizesStr + " Edit";
        const editStart = sizesStr.length + 1;
        sizesText.setRangeFills(editStart, sizesText.characters.length, [
          { type: "SOLID", color: { r: 0, g: 0.4, b: 1 } }
        ]);
      } else {
        sizesText.characters = sizesStr;
      }
      textCol.appendChild(sizesText);
      card.appendChild(textCol);
      return card;
    });
  }
  function ensureCategoryFrame(rootFrame, category) {
    for (const child of rootFrame.children) {
      if (child.type === "FRAME" && child.getPluginData("is_category_frame") === category) {
        return child;
      }
    }
    const f = figma.createFrame();
    f.setPluginData("is_category_frame", category);
    f.fills = [];
    rootFrame.appendChild(f);
    return f;
  }
  function setupCategoryFrame(f, name) {
    f.name = name;
    f.layoutMode = "VERTICAL";
    f.itemSpacing = 8;
    f.paddingLeft = 0;
    f.paddingRight = 0;
    f.paddingTop = 0;
    f.paddingBottom = 0;
    f.primaryAxisSizingMode = "AUTO";
    f.counterAxisSizingMode = "AUTO";
  }
  function ensureHeading(catFrame, text) {
    return __async(this, null, function* () {
      let heading = catFrame.children.find(
        (c) => c.type === "TEXT" && !c.getPluginData("source_id")
      );
      if (!heading) {
        heading = figma.createText();
        heading.fontName = { family: "Inter", style: "Bold" };
        heading.fontSize = 14;
        heading.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
        catFrame.insertChild(0, heading);
      }
      heading.characters = text;
    });
  }
  function handleRelease() {
    return __async(this, null, function* () {
      const progress = (step) => send({ type: "RELEASE_PROGRESS", step });
      progress("Scanning page\u2026");
      const allSets = figma.currentPage.findAllWithCriteria({ types: ["COMPONENT_SET"] });
      const iconSets = [];
      for (const n of allSets) {
        const meta = parseMetadata(n.getPluginData("iconset_metadata"));
        if (meta) iconSets.push({ node: n, metadata: meta });
      }
      if (iconSets.length === 0) {
        figma.notify("No tagged icon sets found on this page.");
        send({ type: "RELEASE_ERROR", message: "No tagged icon sets found on this page." });
        return;
      }
      progress("Building category map\u2026");
      const categoryMap = buildCategoryMap(iconSets);
      const rootFrameName = figma.root.getPluginData("root_frame_name") || ROOT_FRAME_NAME_DEFAULT;
      let rootFrame = findRootFrame();
      if (!rootFrame) {
        rootFrame = figma.createFrame();
        rootFrame.setPluginData("is_root_frame", "true");
      }
      rootFrame.name = rootFrameName;
      rootFrame.layoutMode = "HORIZONTAL";
      rootFrame.itemSpacing = 24;
      rootFrame.paddingLeft = 48;
      rootFrame.paddingRight = 48;
      rootFrame.paddingTop = 48;
      rootFrame.paddingBottom = 48;
      rootFrame.primaryAxisSizingMode = "AUTO";
      rootFrame.counterAxisSizingMode = "AUTO";
      rootFrame.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }];
      progress("Loading fonts\u2026");
      yield figma.loadFontAsync({ family: "Inter", style: "Bold" });
      yield figma.loadFontAsync({ family: "Inter", style: "Regular" });
      const summary = { created: 0, updated: 0, removed: 0 };
      for (const [category, items] of categoryMap) {
        if (category === UNCATEGORIZED_FRAME_NAME) continue;
        progress(`Updating: ${category}\u2026`);
        const catFrame = ensureCategoryFrame(rootFrame, category);
        setupCategoryFrame(catFrame, category);
        yield ensureHeading(catFrame, category);
        const sorted = [...items].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
        const existingIds = /* @__PURE__ */ new Set();
        for (const card of [...catFrame.children]) {
          const sid = card.getPluginData("source_id");
          if (!sid) continue;
          existingIds.add(sid);
          card.remove();
        }
        for (const item of sorted) {
          if (existingIds.has(item.node.id)) {
            summary.updated++;
          } else {
            summary.created++;
          }
          const card = yield createShortCard(item.node, item.metadata, category, false);
          catFrame.appendChild(card);
        }
      }
      if (categoryMap.has(UNCATEGORIZED_FRAME_NAME)) {
        const items = categoryMap.get(UNCATEGORIZED_FRAME_NAME);
        progress("Updating: uncategorized\u2026");
        const catFrame = ensureCategoryFrame(rootFrame, UNCATEGORIZED_FRAME_NAME);
        setupCategoryFrame(catFrame, UNCATEGORIZED_FRAME_NAME);
        yield ensureHeading(catFrame, UNCATEGORIZED_FRAME_NAME);
        rootFrame.appendChild(catFrame);
        const existingIds = /* @__PURE__ */ new Set();
        for (const card of [...catFrame.children]) {
          const sid = card.getPluginData("source_id");
          if (!sid) continue;
          existingIds.add(sid);
          card.remove();
        }
        const sorted = [...items].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
        for (const item of sorted) {
          if (existingIds.has(item.node.id)) {
            summary.updated++;
          } else {
            summary.created++;
          }
          const card = yield createShortCard(item.node, item.metadata, UNCATEGORIZED_FRAME_NAME, true);
          catFrame.appendChild(card);
        }
      }
      progress("Cleaning up\u2026");
      for (const catChild of [...rootFrame.children]) {
        if (catChild.type !== "FRAME") continue;
        const catName = catChild.getPluginData("is_category_frame");
        if (!catName) continue;
        if (!categoryMap.has(catName)) {
          const orphanCount = catChild.children.filter((c) => c.getPluginData("source_id")).length;
          summary.removed += orphanCount;
          catChild.remove();
        }
      }
      send({ type: "RELEASE_DONE", summary });
      figma.notify(
        `Release complete \u2014 ${summary.created} created, ${summary.updated} updated, ${summary.removed} removed`
      );
    });
  }
  figma.on("selectionchange", () => {
    handleGetSelection();
  });
  figma.ui.onmessage = (msg) => {
    switch (msg.type) {
      case "GET_SELECTION":
        handleGetSelection();
        break;
      case "SAVE_METADATA":
        handleSaveMetadata(msg.nodeId, msg.metadata);
        break;
      case "RELEASE":
        handleRelease();
        break;
      case "REMOVE_ICONSET":
        handleRemoveIconset(msg.nodeId);
        break;
      case "GET_SETTINGS":
        handleGetSettings();
        break;
      case "SAVE_SETTINGS":
        handleSaveSettings(msg.rootFrameName);
        break;
      case "CLOSE_PLUGIN":
        figma.closePlugin();
        break;
    }
  };
})();
