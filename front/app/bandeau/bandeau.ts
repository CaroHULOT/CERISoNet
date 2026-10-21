import { Component, input } from '@angular/core';

@Component({
  selector: 'app-bandeau',
  standalone: true,
  imports: [],
  templateUrl: './bandeau.html',
  styleUrls: ['./bandeau.css']
})
export class BandeauComponent {
  message = input('');
  isError = input(false);
}