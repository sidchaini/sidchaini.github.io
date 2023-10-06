const darkTheme = {
    "--accent-color": "#0089c3",
    "--background-color": "#343737",
    "--active-scroll-background": "#424242",
    "--color-text": "#EEEEEE",
    "--footer-color": "#212121",
    "--sep-color": "#212121",
    "--sidebar-color": "#004765"
  };
  
  const lightTheme = {
    "--accent-color": "#0076A8",
    "--background-color": "#fff",
    "--active-scroll-background": "#fff",
    "--color-text": "#777",
    "--footer-color": "#fafafa",
    "--sep-color": "#f4f4f4",
    "--sidebar-color": "#0076A8"
  };
  
  let currentTheme = lightTheme;
  
  function applyTheme(theme) {
    let root = document.documentElement;
    root.style.setProperty("--accent-color", theme["--accent-color"]);
    root.style.setProperty("--background-color", theme["--background-color"]);
    root.style.setProperty("--color-text", theme["--color-text"]);
    root.style.setProperty(
      "--active-scroll-background",
      theme["--active-scroll-background"]
    );
    root.style.setProperty("--footer-color", theme["--footer-color"]);
    root.style.setProperty("--sep-color", theme["--sep-color"]);
    root.style.setProperty("--sidebar-color", theme["--sidebar-color"]);
    currentTheme = theme;
  }
  
  function toggleTheme() {
    if (currentTheme == lightTheme) {
      applyTheme(darkTheme);
    } else {
      applyTheme(lightTheme);
    }
  }
  