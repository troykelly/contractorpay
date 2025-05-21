# Contractor Pay Estimator

This repository contains a simple static web application that helps Australian contractors estimate how much of their invoiced income they should set aside for tax and GST.

The application is completely client side and hosted using GitHub Pages from the [`docs/`](docs/) directory.
It allows you to input your daily rate, select a date range and state, and it automatically calculates the working days in that period (excluding weekends and public holidays).
GST is fixed at 10% with an optional **Collect GST** checkbox. Toggle it and adjust approximate tax rates to see how much money you might bank after setting aside tax.

The calculator can generate a share link with your inputs. Click **Copy Share Link** to copy explanatory text and a URL to your clipboard that will prefill the form for anyone who opens it.

> **Disclaimer**: This tool provides an approximate estimation only and does not constitute financial advice. Always seek professional financial advice for your specific circumstances.

The code now includes a basic public holiday service. It attempts to retrieve holiday data from the public API at [Nager.Date](https://date.nager.at) and falls back to an internal list if the request fails.
