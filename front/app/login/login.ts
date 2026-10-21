import { Component, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  loginUser = signal('');
  passwordUser = signal('');

  loginResult = output<{ success: boolean, data?: any, errorMsg?: string }>();

  constructor(private http: HttpClient) { }

  onSubmit() {
    const credentials = { login: this.loginUser(), password: this.passwordUser() };

    this.http.post('/login', credentials).subscribe({
      next: (user: any) => {
        this.loginResult.emit({ success: true, data: user });
      },
      error: (err) => {
        this.loginResult.emit({ success: false, errorMsg: 'Identifiants invalides.' });
      }
    });
  }
}