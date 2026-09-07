---
title: Locations/Teams
description: How to organize where feedback is collected and manage plan-based location limits.
sidebar:
  order: 1
---


Locations/Teams help you organize where feedback is collected.

## What a Location/Team Is

The app tooltip defines it this way:

`A Location or Team is where feedback is collected. For example, a store, office, or crew.`

## Where To Manage Them

Go to:

1. `Profile Settings`
2. `Locations/Teams`

## What You Can Store

Current fields in code include:

- name
- address
- city
- state
- postal code
- Google review URL
- active/inactive status

## Adding a Location/Team

1. Open `Profile Settings`
2. Stay on the `Locations/Teams` tab
3. Click to add a new location/team
4. Enter the name
5. Fill in address details if relevant
6. Save

The create survey flow can also create a first location/team inline if none exist yet.

## Editing a Location/Team

You can update the saved details later from the same settings tab.

## Google Review Link

The settings screen includes a help accordion called:

- `How to Find Your Google Review Link`

This explains how to:

1. find your Google Place ID
2. build the correct review URL
3. save that URL on the location/team

What this means:

- After a kiosk survey finishes, the app can optionally send people to your Google review flow if a valid review link is available.

## Plan Limits

Current code enforces these limits:

- Starter: 1 Location/Team
- Growth: up to 5 Locations/Teams
- Enterprise: unlimited

If you hit a limit, the API blocks the create request.

## Dashboard Layout

The main dashboard treats Locations/Teams as the primary container.

Inside each Location/Team card, you see:

- the location/team name
- active survey count
- nested survey rows

What this means:

- You can organize multiple surveys under one place or team
- The dashboard emphasizes where feedback is collected first, then which surveys are running there
