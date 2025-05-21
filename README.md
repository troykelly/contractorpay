# Contractor Tools

This repository contains a suite of utilities for independent contractors. The first tool is the **Contractor Pay Estimator**, a simple web application that helps Australian contractors estimate how much of their invoiced income they should set aside for tax and GST.

The tools are completely client side and are hosted using GitHub Pages from the [`docs/`](docs/) directory.
It allows you to input your daily rate, select a date range and state, and it automatically calculates the working days in that period (excluding weekends and public holidays).
GST is fixed at 10% with an optional **Collect GST** checkbox. Toggle it and adjust approximate tax rates to see how much money you might bank after setting aside tax.

The calculator can generate a share link with your inputs. Click **Copy Share Link** to copy formatted text and a URL to your clipboard that will prefill the form for anyone who opens it. Modern browsers will receive both rich and plain text so you can paste into chat apps or emails with proper formatting.

> **Disclaimer**: This tool provides an approximate estimation only and does not constitute financial advice. Always seek professional financial advice for your specific circumstances.

The code now includes a basic public holiday service. It attempts to retrieve holiday data from the public API at [Nager.Date](https://date.nager.at) and falls back to an internal list if the request fails.

The results page also explains the equivalent full‑time salary for your entered rate. Hourly, daily and weekly rates are converted to an annual figure using a 7.2 hour day and 260 working days per year. Tax calculations rely on the official ATO tables provided in [`aus_tax_brackets.js`](docs/aus_tax_brackets.js). From this the tool derives an indicative total salary package including superannuation and any HECS repayments and shows your approximate take‑home pay for each invoice cycle (weekly, fortnightly, monthly or quarterly).

## Design system

All tools share a common design built on [Bootstrap 5](https://getbootstrap.com/). This provides a consistent look and feel and allows additional tools to be added easily in the future.
