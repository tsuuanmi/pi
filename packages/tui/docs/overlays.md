# Overlays

Overlays render components on top of existing content without replacing it. Useful for dialogs, menus, and modal UI.

## Showing Overlays

```typescript
// Default: centered, max 80 columns
const handle = tui.showOverlay(component);
```

## Overlay Options

```typescript
const handle = tui.showOverlay(component, {
  // Sizing
  width: 60,              // Fixed width in columns
  width: "80%",           // Width as percentage of terminal
  minWidth: 40,           // Minimum width floor
  maxHeight: 20,          // Maximum height in rows
  maxHeight: "50%",       // Maximum height as percentage of terminal

  // Anchor-based positioning (default: 'center')
  anchor: 'bottom-right',
  offsetX: 2,             // Horizontal offset from anchor
  offsetY: -1,            // Vertical offset from anchor

  // Percentage-based positioning (alternative to anchor)
  row: "25%",             // Vertical position (0%=top, 100%=bottom)
  col: "50%",             // Horizontal position (0%=left, 100%=right)

  // Absolute positioning (overrides anchor/percent)
  row: 5,                 // Exact row position
  col: 10,                // Exact column position

  // Margin from terminal edges
  margin: 2,              // All sides
  margin: { top: 1, right: 2, bottom: 1, left: 2 },

  // Responsive visibility
  visible: (termWidth, termHeight) => termWidth >= 100,

  // Focus behavior
  nonCapturing: true,     // Don't auto-focus when shown
});
```

### Anchor Values

`'center'`, `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`, `'top-center'`, `'bottom-center'`, `'left-center'`, `'right-center'`

### Resolution Order

1. `minWidth` is applied as a floor after width calculation
2. For position: absolute `row`/`col` > percentage `row`/`col` > `anchor`
3. `margin` clamps final position to stay within terminal bounds
4. `visible` callback controls whether overlay renders (called each frame)

## OverlayHandle Methods

```typescript
// Permanently remove the overlay
handle.hide();

// Temporarily hide (can show again)
handle.setHidden(true);
handle.setHidden(false);   // Show again after hiding
handle.isHidden();          // Check if temporarily hidden

// Focus and bring to visual front
handle.focus();

// Release focus to normal fallback or specific component
handle.unfocus();
handle.unfocus({ target: baseComponent }); // Release to specific component
handle.unfocus({ target: null });          // Leave focus empty

// Check if overlay has focus
handle.isFocused();
```

### Focus Behavior

When `unfocus()` is called without a target:
- The overlay loses focus
- TUI falls back to another visible capturing overlay or the previous focus target

When `unfocus({ target: null })` is called:
- The overlay loses focus
- No component receives input until focus is set again

When `unfocus({ target: component })` is called:
- The overlay loses focus
- The specified component receives input

A focused visible overlay reclaims keyboard input after temporary replacement UI releases focus.

## Multiple Overlays

```typescript
// Hide topmost overlay
tui.hideOverlay();

// Check if any visible overlay is active
tui.hasOverlay();
```

## Common Overlay Patterns

### Confirmation Dialog

```typescript
const dialog = new Container();
dialog.addChild(new Text("Are you sure?"));
dialog.addChild(selectList);

const handle = tui.showOverlay(dialog, {
  width: 40,
  maxHeight: 10,
  anchor: "center",
});
```

### Context Menu

```typescript
const handle = tui.showOverlay(menuList, {
  anchor: "bottom-right",
  offsetX: 2,
  offsetY: -1,
  margin: 1,
  visible: (w, h) => w >= 60,
});
```