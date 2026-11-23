import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { AllNotesComponent } from './all-notes.component';

void bootstrapApplication(AllNotesComponent, {
  providers: [provideZonelessChangeDetection()],
});
