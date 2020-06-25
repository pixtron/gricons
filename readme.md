# Gricons

Gricons is a web component to display icons from the [@gyselroth/icon-collection](https://github.com/gyselroth/icon-collection).
This repo is mostly a fork of [Ionicons](https://github.com/ionic-team/ionicons).

## Using the Web Component

The Gricons Web Component is an easy and performant way to use Gricons in your app. The component will dynamically load an SVG for each icon, so your app is only requesting the icons that you need.

Also note that only visible icons are loaded, and icons which are "below the fold" and hidden from the user's view do not make fetch requests for the svg resource.

### Installation

Place the following `<script>` near the end of your page, right before the closing </body> tag, to enable them.

```html
<script src="./node_modules/@pxtrn/gricons/dist/gricons.js"></script>
```

### Basic usage

To use a built-in icon from the Gricons package, populate the `name` attribute on the gr-icon component:

```html
<gr-icon name="alert"></gr-icon>
```

### Custom icons

To use a custom SVG, provide its url in the `src` attribute to request the external SVG file. The `src` attribute works the same as `<img src="...">` in that the url must be accessible from the webpage that's making a request for the image. Additionally, the external file can only be a valid svg and does not allow scripts or events within the svg element.

```html
<gr-icon src="/path/to/external/file.svg"></gr-icon>
```

## Size

```css
gr-icon {
  font-size: 64px;
}
```

## Color

Specify the icon color by applying the `color` CSS property on the `gr-icon` component.

```css
gr-icon {
  color: blue;
}
```

## License

Gricons is licensed under the [MIT license](http://opensource.org/licenses/MIT).
